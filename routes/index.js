var express = require('express')
var Promise = require('bluebird')
var router = express.Router()
var db = require('../db.js')

/* GET home page. */
router.get('/', (req, res) => {
  res.render('index', { title: 'course-plan' })
})

router.get('/ccs', (req, res) => {
  db.findCcs((stat, result) => {
    res.status(stat).json(result)
  })
})

router.get(/^\/years.*/, (req, res) => {
  var split = req.url.split('/')
  var cc = split[2]
  if (split[split.length - 1] === '') {
    split = split.slice(0, -1)
  }
  if (split.length !== 3 || split[2] === '') {
    res.status(400).end('format: /years/cc/')
    return
  }
  db.findYears(cc, (stat, result) => {
    res.status(stat).json(result)
  })
})

router.get(/^\/unis.*/, (req, res) => {
  var split = req.url.split('/')
  // get rid of trailing whitespace if ending / is added
  if (split[split.length - 1] === '') {
    split = split.slice(0, -1)
  }
  if (split.length !== 4) {
    res.status(400).send('format: /unis/communitycollege/year')
    return
  }
  var cc = split[2]
  var year = split[3]
  db.findUnis(cc, year, (stat, result) => {
    res.status(stat).json(result)
  })
})

router.get(/^\/majors.*/, (req, res) => {
  var urlSplit = req.url.split('/').slice(2)
  // get rid of trailing whitespace if ending / is added
  if (urlSplit[urlSplit.length - 1] === '') {
    urlSplit = urlSplit.slice(0, -1)
  }
  if (urlSplit.length !== 3) {
    res.status(400).end('format: /majors/communitycollege/year/university/')
    return
  }
  var college = urlSplit[0]
  var year = urlSplit[1]
  var uni = urlSplit[2]
  db.findMajors(college, year, uni, (stat, result) => {
    res.status(stat).json(result)
  })
})

router.get(/^\/plan.*/, (req, res) => {
  var urlSplit = req.url.split('/').slice(2)
  // get rid of trailing whitespace if ending / is added
  if (urlSplit[urlSplit.length - 1] === '') {
    urlSplit = urlSplit.slice(0, -1)
  }
  if (urlSplit.length < 3) {
    res.status(400).send('format: /plan/communitycollege/year/uni,major/uni,major/')
    return
  }
  var cc = urlSplit[0]
  var year = urlSplit[1]
  // generate the list of university/major combinations
  var uniMajors = []
  var valid = true
  urlSplit.slice(2).forEach((item) => {
    if (!valid) {
      return
    }
    var separated = item.split(',')
    var currUni = separated[0]
    var currMajor = separated[1]
    db.getPlan(cc, year, currUni, currMajor, (stat, planData) => {
      if (stat !== 200) {
        valid = false
        res.status(stat).json(planData)
        return
      }
      uniMajors.push({
        'uni': currUni,
        'major': currMajor,
        'plan': planData
      })
      if (uniMajors.length === urlSplit.slice(2).length) {
        // generate json w/ courses, universities they're for, and their unit counts
        courseLists(cc, year, uniMajors, (err, data) => {
          if (err) {
            res.status(500).json({
              'error': 'problem finding units'
            })
            throw err
          } else {
            res.json(data[0]) // 0 index is the most efficient
          }
        })
      }
    })
  })
})

function courseLists (cc, year, uniMajors, cb) {
  // The meat of this site. Finds the optimal course plan
  var reqs = {}

  // add the required courses for each university
  uniMajors.forEach((uniMajor) => {
    var plan = uniMajor['plan']
    plan['required'].forEach((crs) => {
      if (crs in reqs) {
        reqs[crs].push(uniMajor.uni)
      } else {
        reqs[crs] = [uniMajor.uni]
      }
    })
  })

  // compile the data of course options
  var data = []
  uniMajors.forEach((uniMajor) => {
    var plan = uniMajor['plan']
    plan['choices'].forEach((choice) => {
      data.push({'uni': uniMajor.uni, 'courses': choice})
    })
    plan['choosenum'].forEach((group) => {
      data.push({
        'uni': uniMajor.uni,
        'courses': chooseK(group['choices'], group['num'])
      })
    })
  })

  // find the most efficient combination
  var combos = findCombos(data)
  var courseLists = [] // an array of course combinations
  combos.forEach((combo) => {
    var courseList = {}
    Object.keys(reqs).forEach((key) => {
      courseList[key] = reqs[key].slice()
    })
    combo.forEach((grp) => {
      grp['courses'].forEach((crs) => {
        if (crs in courseList) {
          if (courseList[crs].indexOf(grp['uni']) === -1) {
            courseList[crs].push(grp['uni'])
          }
        } else {
          courseList[crs] = [grp['uni']]
        }
      })
    })
    courseLists.push(courseList)
  })

  var getUnits = Promise.promisify(db.getUnits)
  var indices = []
  courseLists.forEach((el, i) => {
    indices.push(i)
  })
  Promise.map(indices, (i) => {
    var unitCnt = 0
    return Promise.map(Object.keys(courseLists[i]), (crs) => {
      // also change the courseList to hold both the universities for each
      // course AND the unit count for that course
      return getUnits(cc, year, crs)
      .then((units) => {
        courseLists[i][crs] = {
          'unis': courseLists[i][crs],
          'units': units
        }
        unitCnt += units
      })
      .error((err) => {
        cb(err)
      })
    })
    .then(() => {
      courseLists[i] = {
        'courses': courseLists[i],
        'units': unitCnt
      }
    })
  })
  .then(() => {
    // sort the list so lowest count is first
    courseLists.sort((lstA, lstB) => {
      if (lstA['units'] > lstB['units']) {
        return 1
      }
      if (lstA['units'] < lstB['units']) {
        return -1
      }
      return 0
    })
  })
  .then(() => {
    cb(null, courseLists)
  })
}

function findCombos (data) {
  // Takes an array of objects as follows:
  // [{
  // 'uni':'uni name',
  // 'courses': [
  //    [ // option 1
  //      course 1, course 2
  //    ],
  //    [ //option 2
  //      course 3, course 4
  //    ]
  // }]
  // the different options are compiled into a list of possible options

  // recursive helper function
  function makeCombos (data, combos, ind, chain) {
    // combos is an array of possible combinations, ind is the current
    // index of courses being looked at, chain is the previously chosen
    // course group for this possibility
    if (ind === data.length) {
      combos.push(chain)
    } else {
      data[ind]['courses'].forEach((grp) => {
        var newChain = chain.slice()
        newChain.push({
          'uni': data[ind]['uni'],
          'courses': grp
        })
        makeCombos(data, combos, ind + 1, newChain)
      })
    }
  }
  var combos = []
  makeCombos(data, combos, 0, [])
  return combos
}

function chooseK (data, k) {
  // this function generates course group options, for the case where
  // there is a choosenum set. For example: choose 2 from ['a','b','c']
  // will return [['a','b'],['a','c'],['b','c']]

  // helper function acts similarly to the makeComos function in findCombos()
  function makeCombos (data, combos, k, chain, ind) {
    if (chain.length === k) {
      combos.push(chain)
    } else {
      for (var i = ind + 1; i < data.length; i++) {
        var newChain = chain.slice()
        newChain.push(data[i])
        makeCombos(data, combos, k, newChain, i)
      }
    }
  }
  var combos = []
  makeCombos(data, combos, k, [], -1)
  return combos
}

module.exports = router
