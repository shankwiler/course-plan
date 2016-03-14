var express = require('express')
var fs = require('fs')
var router = express.Router()
var http = require('http')
var plans = require('../data/plans.json')
var ccs = require('../data/ccs.json')
var db = require('../db.js')

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'course-plan' })
})

router.get('/ccs', (req, res) => {
  db.findCcs((stat, result) => {
    res.status(stat).json(result)
  })
})

router.get(/^\/years.*/, (req, res) => {
  var split, cc, yrs, nameInd
  split = req.url.split('/')
  cc = split[2]
  if(split[split.length -1] === '')
    split = split.slice(0, -1)
  if (split.length !== 3 || split[2] === '') {
    res.status(400).end('format: /years/cc/')
    return
  }
  db.findYears(cc, (stat, result) => {
    res.status(stat).json(result)
  })
})

router.get(/^\/unis.*/, function(req, res) {
  var split, cc, year
  split = req.url.split('/')
  // get rid of trailing whitespace if ending / is added
  if (split[split.length - 1] === '')
    split = split.slice(0, -1)
  if (split.length !== 4) {
    res.status(400).send('format: /unis/communitycollege/year')
    return
  }
  cc = split[2]
  year = split[3]
  db.findUnis(cc, year, (stat, result) => {
    res.status(stat).json(result)
  })
})

router.get(/^\/majors.*/, function(req, res) {
  var urlSplit, college, uni, year
  urlSplit = req.url.split('/').slice(2)
  // get rid of trailing whitespace if ending / is added
  if (urlSplit[urlSplit.length - 1] === '')
    urlSplit = urlSplit.slice(0, -1)
  if (urlSplit.length !== 3) {
    res.status(400).end('format: /majors/communitycollege/year/university/')
    return
  }
  college = urlSplit[0]
  year = urlSplit[1]
  uni = urlSplit[2]
  db.findMajors(college, year, uni, (stat, result) => {
    res.status(stat).json(result)
  })
})

router.get(/^\/plan.*/, function(req, res) {
  var urlSplit, cc, year, uniMajors, rank, valid
  urlSplit = req.url.split('/').slice(2)
  // get rid of trailing whitespace if ending / is added
  if (urlSplit[urlSplit.length - 1] === '')
    urlSplit = urlSplit.slice(0, -1)
  if (urlSplit.length < 3) {
    res.status(400).send('format: /plan/communitycollege/year/uni,major/uni,major/')
    return
  }
  cc = urlSplit[0]
  year = urlSplit[1]
  if (!(cc in ccs) || !(cc in plans)) {
    res.status(404).send(cc + ' not found')
    return
  }
  if (!(year in plans[cc])) {
    res.status(404).send(year + ' not found for ' + cc)
    return
  }
  
  // generate the list of university/major combinations
  uniMajors = []
  var valid = true
  urlSplit.slice(2).forEach((item) => {
    if (valid) {
      var separated = item.split(',')
      var currUni = separated[0]
      var currMajor = separated[1]
      if (separated.length > 1 &&
        currUni in plans[cc][year] && currMajor in plans[cc][year][currUni])
        uniMajors.push({'uni': currUni, 'major': currMajor})
      else {
        res.status(404).end(item + ' not found')
        valid = false
      }
    }
  })
  if (valid) {
    // generate json w/ courses, universities they're for, and their unit counts
    var data, newData
    data = courseLists(cc, year, uniMajors)[0]
    // newData stores the courses, their units, and universities they're for
    newData = {'courses':{}}
    Object.keys(data['courses']).forEach((crs) => {
      var unis, crsInfo
      unis = data['courses'][crs]
      crsInfo = {
        'unis': unis,
        'units': ccs[cc][year][crs]
      }
      newData['courses'][crs] = crsInfo
    })
    newData['units'] = data['units']
    
    res.json(newData)
  }
})

// TODO look back over airbnb style guide. Find things to fix such as dot
// vs bracket notation etc.
// TODO required courses may be able to be shoved into the compilation of 
// data for course options, rather than doing it separately (w/ reqs).
// may be cleaner.

function courseLists(cc, year, uniMajors) {
  // The meat of this site. Finds the optimal course plan
  var reqs = {}
  
  // add the required courses for each university
  uniMajors.forEach((uniMajor) => {
    var plan = plans[cc][year][uniMajor.uni][uniMajor.major]
    plan['required'].forEach((crs) => {
      if (crs in reqs)
        reqs[crs].push(uniMajor.uni)
      else
        reqs[crs] = [uniMajor.uni]
    })
  })
  
  // compile the data of course options
  var data = []
  uniMajors.forEach((uniMajor) => {
    var plan = plans[cc][year][uniMajor.uni][uniMajor.major]
    plan['choices'].forEach((choice) => {
      data.push({'uni':uniMajor.uni, 'courses': choice})
    })
    //console.log('plan', plan)
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
          if (courseList[crs].indexOf(grp['uni']) == -1) {
            courseList[crs].push(grp['uni'])
          }
        }
        else
          courseList[crs] = [grp['uni']]
      })
    })
    courseLists.push(courseList)
  })
  
  // change the course lists to include their unit count
  var courseLists = courseLists.map((crsList) => {
    var unitCnt = 0
    Object.keys(crsList).forEach((crs) => {
      unitCnt += ccs[cc][year][crs]
    })
    return {'courses': crsList, 'units': unitCnt}
  })
  
  // sort the list so lowest count is first
  courseLists.sort((lstA, lstB) => {
    if (lstA['units'] > lstB['units'])
      return 1
    if (lstA['units'] < lstB['units'])
      return -1
    return 0
  })
  
  // every possible course path is returned, with the optimal one
  // being in the 0 index
  return courseLists
}

function findCombos(data) {
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
  function makeCombos(data, combos, ind, chain) {
    // combos is an array of possible combinations, ind is the current
    // index of courses being looked at, chain is the previously chosen
    // course group for this possibility
    if (ind == data.length)
      combos.push(chain)
    else {
      data[ind]['courses'].forEach(function(grp) {
        newChain = chain.slice()
        newChain.push({
          'uni': data[ind]['uni'],
          'courses': grp
        })
        makeCombos(data, combos, ind + 1, newChain)
      })
    }
  }
  combos = []
  makeCombos(data, combos, 0, [])
  return combos
}

function chooseK(data, k) {
  // this function generates course group options, for the case where
  // there is a choosenum set. For example: choose 2 from ['a','b','c']
  // will return [['a','b'],['a','c'],['b','c']]
  
  // helper function acts similarly to the makeComos function in findCombos()
  function makeCombos(data, combos, k, chain, ind) {
    if (chain.length == k)
      combos.push(chain)
    else {
      for (var i = ind + 1; i < data.length; i++) {
        var newChain = chain.slice()
        newChain.push(data[i])
        makeCombos(data, combos, k, newChain, i)
      } 
    } 
  }
  combos = []
  makeCombos(data, combos, k, [], -1)
  return combos
}

module.exports = router