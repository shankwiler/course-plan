var express = require('express')
var router = express.Router()
var http = require('http')
var db = require('../db.js')
var fs = require('fs')

router.get('/', function(req, res, next) {
  res.render('parser', {title: 'parse' })
})

router.get('/ccs', (req, res) => {
  // TODO use loadOptions function
  
  http.get('http://www.assist.org/web-assist/welcome.html', (aRes) => {
    var html
    html = ''
    
    aRes.setEncoding('utf8')
    aRes.on('data', (chunk) => {
      html += chunk
    })
    aRes.on('end', () => {
      var list
      list = html.split('</option>').slice(1, -1).map((line) => {
        return dataFromLine(line)
      })
      res.json({opts:list})
    })
  }).on('error', (e) => {
    console.log(e)
  })
})

router.get(/^\/years.*/, (req, res) => {
  var split, cc
  split = req.url.split('/')
  if (split.length !== 3 || split[2] === '') {
    res.status(400).end()
    return
  }
  cc = req.url.split('/')[2]
  pullOpts('http://www.assist.org/web-assist/' + cc, 'helptextAY\')">', (data) => {
    if (data.status !== 200)
      res.status(data.status).end()
    else
      res.json({opts:data.json})
  })
})

router.get(/^\/unis.*/, (req, res) => {
  var split, assistUrl
  split = req.url.split('/')
  if (split.length !== 3 || split[2] === '') {
    res.status(400).end()
    return
  }
  assistUrl = split[2]
  console.log(assistUrl)
  pullOpts('http://www.assist.org/web-assist/' + assistUrl, 'campus<', (data) => {
    if (data.status !== 200)
      res.status(data.status).end()
    else
      res.json({opts:data.json})
  })
})

router.get(/^\/majors.*/, (req, res) => {
  var split, assistUrl
  split = req.url.split('/')
  if (split.length !== 3 || split[2] === '') {
    res.status(400).end()
    return
  }
  assistUrl = split[2]
  pullOpts('http://www.assist.org/web-assist/' + assistUrl, 'Select a major', (data) => {
    if (data.status !== 200)
      res.status(data.status).end()
    else {
      var ret
      ret = {}
      ret.opts = data.json
      ret.submitUrl = parseMajorForm(data.html)
      res.json(ret)
    }
  })
})


router.get(/^\/plan.*/, (req, res) => {
  var split, assistUrl
  split = req.url.split('/')
  if (split.length !== 3 || split[2] === '') {
    res.status(400).end()
    return
  }
  assistUrl = split[2]
  getPlan(assistUrl, (planUrl) => {
    res.end(planUrl)
  })
})

router.get(/^\/data.*/, (req, res) => {
  var split, cc, year, uni, major
  split = req.url.split('/')
  if (split.length !== 6 || split[5] === '') {
    res.status(400).end()
    return
  }
  cc = split[2]
  year = split[3]
  uni = split[4]
  major = split[5]

  db.getPlan(cc, year, uni, major, (stat, data) => {
    if (stat !== 200) {
      res.status(stat).json(data)
      return
    }
    findCourseUnitsForPlan(cc, year, data, (units) => {
      res.json({
        'courses': data,
        'units': units
      })
    })
  })
})

router.post(/^\/data.*/, (req, res) => {
  var split, cc, year, uni, major
  split = req.url.split('/')
  if (split.length !== 6 || split[5] === '') {
    res.status(400).end()
    return
  }
  cc = split[2]
  year = split[3]
  uni = split[4]
  major = split[5]
  
  db.insertOrUpdatePlan(cc, year, uni, major, req.body, () => {res.send('ok'); console.log('ok')})
  
  /*
  if (!plans[cc]) {
    plans[cc] = {}
    plans[cc]['name'] = req.body.college_name
  }
  console.log('hi.125')
  if (!plans[cc][year])
    plans[cc][year] = {}
  console.log('hi.25')
  if (!plans[cc][year][uni]) {
    plans[cc][year][uni] = {}
    plans[cc][year][uni]['name'] = req.body.uni_name
  }
  console.log('hi.5')
  if (!plans[cc][year][uni][major])
    plans[cc][year][uni][major] = {}
  
  console.log('hi1')
  
  plans[cc][year][uni][major] = JSON.parse(req.body.courses)
  plans[cc][year][uni][major]['name'] = req.body.major_name
  
  
  //console.log(JSON.stringify(req.body.courses, null, '  ').replace(/\\n/g, '\n').replace(/\\\"/g, '"'))
  
  fs.writeFile(__dirname + '/../data/plans.json', JSON.stringify(plans, null, '  '), (err) => {
    if (err)
      throw err
    console.log('saved courses')
  })
  
  if(!ccs[cc])
    ccs[cc] = {}
  if(!ccs[cc][year])
    ccs[cc][year] = {}
  
  updateObject(ccs[cc][year], JSON.parse(req.body.units))
  
  fs.writeFile(__dirname + '/../data/ccs.json', JSON.stringify(ccs, null, '  '), (err) => {
    if (err)
      throw err
    console.log('saved units')
  })
  
  res.send('success')
  */
  
})

router.get(/^\/guess.*/, (req, res) => {
  var split, assistUrl
  split = req.url.split('/')
  if (split.length !== 3 || split[2] === '') {
    res.status(400).end()
    return
  }
  assistUrl = split[2]
  getPlan(assistUrl, (planUrl) => {
    http.get(planUrl, (aRes) => {
      if (aRes.statusCode !== 200) {
        res.status(aRes.statusCode).end()
        return
      }
      var html
      html = ''
      aRes.setEncoding('utf8')
      aRes.on('data', (chunk) => {
        html += chunk
      })
      aRes.on('end', () => {
        res.json({
          'plan': parsePlan(html),
          'units': getUnits(html)
        })
      })
    })
  })
})

function dataFromLine(line) {
  return {
    link: line.substring(line.search('value="') + 7, line.search('">')),
    name: line.substring(line.search('">') + 2)
  }
}

function getPlan(url, cb) {
  var fullUrl = 'http://www.assist.org/web-assist/' + url
  http.get(fullUrl, (res) => {
    if (res.statusCode !== 200) {
      cb('invalid url')
      return
    }
    var html
    html = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => {
      html += chunk
    })
    res.on('end', () => {
      var planUrl
      console.log(planUrl)
      planUrl = html.split('<iframe')[1].split('src="')[1].split('"')[0]
      //getPlanText(planUrl, cb)
      cb(planUrl)
    })
  }).on('error', (e) => {
    console.log(e)
  })
}

function pullOpts(url, sep, callback) {
  // returns json with status, json (list of options), html
  // TODO refactor code so one function returns html, another parses,
  // would be much cleaner
  http.get(url, (res) => {
    if (res.statusCode !== 200) {
      callback({
        status: res.statusCode
      })
    }
    else {
      var html
      html = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        html += chunk
      })
      
      res.on('end', () => {
        var list, block, lines, valSubstr, endValLoc, link, uni
        if (html.indexOf(sep) === -1) {
          callback({status: 404})
          return
        }
        block = html.split(sep)[1].split('</select>')[0]
        lines = block.split('</option>').slice(0, -1)
        list = lines.map((line) => {
          valSubstr = line.substring(line.search('value="') + 7)
          endValLoc = valSubstr.search('"')
          link = valSubstr.substring(0, endValLoc).replace('&amp;', '&')
          uni = valSubstr.substring(valSubstr.search('>') + 1)
          return {
            link: link,
            name: uni
          }
        })
        callback({
          status: 200,
          json: list,
          html: html
        })
      })                   
    }
  }).on('error', (e) => {
    console.log(e)
  })
}

function parseMajorForm(html) {
  var page, qstr
  html = html.split('<form name="major"')[1].split('</select>')[0]
  page = html.substring(html.indexOf('action="') + 8)
  page = page.substring(0, page.indexOf('">'))
  
  // for the inputs before the major select box, get their name and value
  qstr = ''
  html.split('<select')[0].split('\n').forEach(function (line) {
    if (line.indexOf('<input') !== -1) {
      var name, val
      name = line.split('name="')[1].split('"')[0]
      val = line.split('value="')[1].split('"')[0]
      qstr += name + '=' + val + '&'
    }
  })
  qstr = qstr.substring(0, qstr.length - 1)
  
  return page + '?' + qstr
}

function parsePlan(data) {
  // TODO put code into functions to make easier to read.
  
  var sep = /--------------------------------------------------------------------------------|AND/
  var reOr = />\s*OR\s*<.*\|/
  
  var blocks = data.split(sep)
  
  var courses = {
    'required': [],
    'choices': [],
    'choosenum': [],
    'missing': []
  }
  blocks.forEach((block) => {
    if (reOr.exec(block)) {
      var grps, opts, allMiss
      grps = block.split(reOr)
      opts = []
      grps.forEach((grp) => {
        opts.push(getCourses(grp))
      })
      
      allMiss = true
      opts.forEach((opt) => {
        opt.forEach((crs) => {
          if (crs.split(' ')[0] !== 'missing')
            allMiss = false
        })
      })
      
      if (allMiss) {
        var str = ''
        opts.forEach((opt, i) => {
          if (i !== 0)
            str += ' or '
          str += opt.map((crs) => {
            return crs.substr(crs.search(' ') + 1)
          }).join(' and ')
        })
        courses.missing.push(str)
      }
      else {
        var newOpts
        newOpts = []
        opts.forEach((opt) => {
          var valid
          valid = true
          opt.forEach((crs) => {
            if (crs.includes('missing'))
              valid = false
          })
          if (valid)
            newOpts.push(opt)
        })
        
        if (newOpts.length === 1) {
          newOpts[0].forEach((crs) => {
            courses.required.push(crs)
          })
        }
        else
          courses.choices.push(opts)
           
      }
    }
    else {
      getCourses(block).forEach((crs) => {
        if (crs.split(' ')[0] === 'missing') {
          var crsName
          crsName = crs.split(' ').slice(1).join(' ')
          if (courses.missing.indexOf(crsName) === -1)
            courses.missing.push(crsName)
        }
        else if (courses.required.indexOf(crs) === -1)
          courses.required.push(crs)
      })
    }
  })
  
  return courses
}

function getCourses(str) {
  var courses, prevAnd, prevMissing
  prevAnd = null
  prevMissing = false
  courses = []
  str.split('\n').forEach((line) => {
    var ccCourse = /\([0-9]+(\.[0-9]+)?\)$/.exec(line) // (0-9) found at end of line
    var uniCourse = /\([0-9]+(\.[0-9]+)?\)\|/.exec(line) // (0-9)| found in line
    
    // if there's a uni course and no cc course and either there was no &
    // sign on the past uni course, or there was and that course was missing
    if (uniCourse && !ccCourse && 
      (!prevAnd || (prevAnd && prevMissing))) {
      courses.push('missing ' + line.split(' ').slice(0,2).join(' '))
      prevMissing = true
    }
    
    if (ccCourse) {
      courses.push(
        line.slice(line.search(/\|/) + 1) // line after |
        .split(' ').slice(0,2).join(' ') // take first two words
      )
      prevMissing = false
    }
    
    if (uniCourse)
      prevAnd = />\s*\&\s*<.*\|/.exec(line)
  })
  
  return courses
}

function getUnits(str) {
  var units
  units = {}
  str.split('\n').forEach((line) => {
    // regex finds parens with nums, optional floating point number
    var unitCnt = /\([0-9]+(\.[0-9]+)?\)$/.exec(line)
    if (unitCnt) {
      // the count is the string result, with cut off open and close parentheses
      unitCnt = parseFloat(unitCnt[0].substr(1, unitCnt[0].length - 2))
      var course = line.split('|')[1]
      if (course) {
        var andFound = course.search(/<b/i)
        if (andFound !== -1)
          course = course.substr(0, andFound)
        else
          course = course.substr(0, course.search(/\ \ /))
        units[course] = unitCnt
      }
    }
  })
  
  return units
}

function updateObject(base, updated) {
  Object.keys(updated).forEach((key) => {
    base[key] = updated[key]
  })
}

function findCourseUnitsForPlan(cc, year, coursePlan, cb) {
  var units = {}
  var courses = new Set()
  
  // add the required courses to the list
  coursePlan.required.forEach((crs) => {
    courses.add(crs)
  })
  
  // add the courses in the choices blocks
  coursePlan.choices.forEach((choice) => {
    choice.forEach((grp) => {
      grp.forEach((crs) => {
        courses.add(crs)
      })
    })
  })
  
  // add the courses in the chooseNum blocks
  coursePlan.choosenum.forEach((grp) => {
    grp.choices.forEach((crs) => {
      courses.add(crs)
    })
  })
  
  courses.forEach((crs) => {
    db.getUnits(cc, year, crs, (err, unitCnt) => {
      // don't throw an error if a course's units are undefined
      if (err) {
        console.log("ERROR", err)
        units[crs] = 'MISSING'
      }
      else {
        units[crs] = unitCnt
      }
      if (Object.keys(units).length === courses.size) {
        cb(units)
      }
    })
  })
}

module.exports = router
