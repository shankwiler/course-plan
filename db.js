// TODO add setup function to create table, secondary indexes
var r = require('rethinkdb')
var Promise = require('bluebird')

module.exports.findCcs = (cb) => {
  // callback accepts (status, json)
  var conn = null
  r.connect({db: 'course_plan'})
  .then((connection) => {
    conn = connection
    return r.table('plans').distinct({index: 'college'}).run(conn)
  })
  .then((cursor) => {
    return cursor.toArray()
  })
  .then((result) => {
    var ret = {}
    var ccs = {}
    var added = 0
    result.forEach((cc) => {
      // for each unique college, get its real (formatted) name and add it
      // a getAll must be used to find a plan that contains the right college name
      r.table('plans')
      .getAll(cc, {index: 'college'})
      .pluck('college_name')
      .run(conn)
      .then((ccCursor) => {
        return ccCursor.next()
      })
      .then((row) => {
        ccs[cc] = row['college_name']
        added += 1
        if (added === result.length) {
          cb(200, ccs)
        }
      })
      .error((err) => {
        throw err
      })
    })
  })
  .error((err) => {
    throw err
  })
}


module.exports.findYears = (cc, cb) => {
  r.connect({db: 'course_plan'})
  .then((conn) => {
    return r.table('plans').getAll(cc, {index: 'college'})
          .pluck('year').distinct()
          .run(conn)
  })
  .then((cursor) => {
    return cursor.toArray()
  })
  .then((result) => {
    var ret = result.map((el) => {
      return el['year']
    })
    if (ret.length === 0) {
      cb(404, {
        error: cc + ' is not a valid cc.'
      })
    } else {
      cb(200, ret)
    }
  })
  .error((err) => {
    throw err
  })
}

module.exports.findUnis = (cc, year, cb) => {
  r.connect({db: 'course_plan'})
  .then((conn) => {
    return r.table('plans').getAll([cc, year], {index: 'college_year'})
            .pluck('uni', 'uni_name').distinct()
            .run(conn)
  })
  .then((cursor) => {
    return cursor.toArray()
  })
  .then((result) => {
    var ret = {}
    result.forEach((item) => {
      ret[item['uni']] = item['uni_name']
    })
    if (result.length === 0) {
      module.exports.findFault(cc, year, null, null, (err) => {
        cb(404, {
          error: err
        })
      })
    }
    else {
      cb(200, ret)
    }
  })
  .error((err) => {
    throw err
  })
}

module.exports.findMajors = (cc, year, uni, cb) => {
  r.connect({db: 'course_plan'})
  .then((conn) => {
    return r.table('plans')
            .getAll([cc, year, uni], {index: 'college_year_uni'})
            .pluck('major', 'major_name').distinct()
            .run(conn)
  })
  .then((result) => {
    var ret = {}
    result.forEach((el) => {
      ret[el['major']] = el['major_name']
    })
    if (result.length === 0) {
      module.exports.findFault(cc, year, uni, null, (err) => {
        cb(404, {
          error: err
        })
      })
    }
    else {
      cb(200, ret)
    }
  })
  .error((err) => {
    throw err
  })
}

module.exports.findFault = (cc, year, uni, major, cb) => {
  // cb accepts a failure message
  var failureFound = false
  if (!cc) {
    throw 'no cc passed to findFault'
  }
  var conn = null
  r.connect({db: 'course_plan'})
  // first check if the cc is in the db
  .then((connection) => {
    conn = connection
    return r.table('plans')
            .getAll(cc, {index: 'college'}).count()
            .run(conn)
  })
  .then((count) => {
    if (count === 0) {
      failureFound = true
      cb(cc + ' is not a valid cc.')
    }
  })
  // next check if the year is in the db for that cc
  .then(() => {
    if (year && !failureFound) {
      return r.table('plans')
              .getAll([cc, year], {index: 'college_year'}).count()
              .run(conn)
      .then((count) => {
        if (count === 0) {
          failureFound = true
          cb(year + ' is not a valid year for ' + cc + '.')
        }
      })
    }
  })
  // next check if the uni is in the db for that cc and year
  .then(() => {
    if (year && uni && !failureFound) {
      return r.table('plans')
              .getAll([cc, year, uni], {index: 'college_year_uni'}).count()
              .run(conn)
      .then((count) => {
        if (count === 0) {
          failureFound = true
          cb(uni + ' is not a valid university for ' + year + '.')
        }
      })
    }
  })
  // next check if the major exists for the other parameters given
  .then(() => {
    if (year && uni && major && !failureFound) {
      return r.table('plans')
              .getAll([cc, year, uni, major], {index: 'college_year_uni_major'})
              .count().run(conn)
      .then((count) => {
        if (count.length === 0) {
          failureFound = true
          cb(major + ' is not a valid major for ' + uni + '.')
        }
      })
    }
  })
  // if no failure found, pass null
  .then(() => {
    if (!failureFound) {
     cb(null)
    }
  })
  .error((err) => {
    throw err
  })
}

module.exports.getPlan = (cc, year, uni, major, cb) => {
  r.connect({db: 'course_plan'})
  .then((conn) => {
    return r.table('plans')
            .getAll([cc, year, uni, major], {index: 'college_year_uni_major'})('plan')
            .run(conn)
  })
  .then((cursor) => {
    return cursor.next()
  })
  .then((row) => {
    cb(200, row)
  })
  .error((err) => {
    if (err.name === 'ReqlDriverError' && err.message === 'No more rows in the cursor.') {
      module.exports.findFault(cc, year, uni, major, (errMsg) => {
        cb(404, {
          err: errMsg
        })
      })
    }
    else {
      throw err
    }
  })
}

module.exports.getUnits = (cc, year, course, cb) => {
  r.connect({db: 'course_plan'})
  .then((conn) => {
    return r.table('units').getAll([cc, year, course], {index: 'cc_year_course'})('units')
            .run(conn)
  })
  .then((cursor) => {
    return cursor.next()
  })
  .then((row) => {
    cb(null, row)
  })
  .error((err) => {
    cb(err, null)
  })
}

module.exports.insertOrUpdatePlan = (cc, year, uni, major, reqBody, cb) => {
  var plan = JSON.parse(reqBody['courses'])
  var units = JSON.parse(reqBody['units'])
  updatePlan(cc, year, uni, major, plan)
  .then(() => {
    return addOrUpdateUnits(cc, year, units)
  })
  .then(() => {
    cb()
  })
  .error((err) => {
    if (err.name === 'ReqlDriverError' && err.message === 'No more rows in the cursor.') {
      addPlan(cc, year, uni, major, reqBody)
      .then(() => {
        return addOrUpdateUnits(cc, year, units)
      })
      .then(() => {
        cb()
      })
    }
    else {
      throw err
    }
  })
}

var updatePlan = Promise.promisify((cc, year, uni, major, plan, cb) => {
  var conn = null
  r.connect({db: 'course_plan'})
  .then((connection) => {
    conn = connection
    return r.table('plans')
            .getAll([cc, year, uni, major], {index: 'college_year_uni_major'})
            .run(conn)
  })
  .then((cursor) => {
    return cursor.next()
  })
  .then((row) => {
    return r.table('plans').get(row['id'])
            .update({'plan': plan}).run(conn)
    .error((err) => {
      throw err
    })
  })
  .then(() => {
    cb(null)
  })
  .error((err) => {
    cb(err)
  })
})

var addOrUpdateUnits = Promise.promisify((cc, year, unitsObj, cb) => {
  Promise.map(Object.keys(unitsObj), (crs) => {
    return updateUnits(cc, year, crs, unitsObj[crs])
    .error((err) => {
      if (err.name === 'ReqlDriverError' && err.message === 'No more rows in the cursor.') {
        return addUnits(cc, year, crs, unitsObj[crs])
      }
      else {
        throw err
      }
    })
  })
  .then(() => {
    cb()
  })
})

var updateUnits = Promise.promisify((cc, year, course, units, cb) => {
  var conn = null
  r.connect({db: 'course_plan'})
  .then((connection) => {
    conn = connection
    return r.table('units').getAll([cc, year, course], {index: 'cc_year_course'}).run(conn)
  })
  .then((cursor) => {
    return cursor.next()
  })
  .then((row) => {
     return r.table('units').get(row['id']).update({'units': units}).run(conn)
  })
  .then(() => {
    cb(null)
  })
  .error((err) => {
    cb(err)
  })
})

var addUnits = Promise.promisify((cc, year, course, units, cb) => {
  r.connect({db: 'course_plan'})
  .then((conn) => {
    return r.table('units').insert({
      'cc': cc,
      'year': year,
      'course': course,
      'units': units
    }).run(conn)
  })
  .then(() => {
    cb(null)
  })
  .error((err) => {
    cb(err)
  })
})

var addPlan = Promise.promisify((cc, year, uni, major, reqBody, cb) => {
  r.connect({db: 'course_plan'})
  .then((conn) => {
    return r.table('plans').insert({
      'college': cc,
      'college_name': reqBody['college_name'],
      'year': year,
      'uni': uni,
      'uni_name': reqBody['uni_name'],
      'major': major,
      'major_name': reqBody['major_name'],
      'plan': JSON.parse(reqBody['courses'])
    }).run(conn)
  })
  .then(() => {
    cb(null)
  })
  .error(() => {
    throw err
  })
})