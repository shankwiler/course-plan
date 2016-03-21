// TODO add setup function to create table, secondary indexes
var r = require('rethinkdb')
var Promise = require('bluebird')

module.exports.findCcs = (cb) => {
  // callback accepts (status, json)
  var conn = null
  var ccs = {}
  r.connect({db: 'course_plan'})
  .then((connection) => {
    conn = connection
    return r.table('plans').distinct({index: 'college'}).run(conn)
  })
  .then((cursor) => {
    return cursor.toArray()
  })
  .then((result) => {
    // for each unique college, get its real (formatted) name and add it
    // a getAll must be used to find a plan that contains the right college name
    return Promise.map(result, (cc) => {
      return r.table('plans')
      .getAll(cc, {index: 'college'})('college_name')
      .run(conn)
      .then((ccCursor) => {
        return ccCursor.next()
      })
      .then((ccName) => {
        ccs[cc] = ccName
      })
      .error((err) => {
        throw err
      })
    })
  })
  .then(() => {
    cb(200, ccs)
  })
  .error(() => {
    cb(500, null)
  })
  .finally(() => {
    if (conn) {
      conn.close()
    }
  })
}

module.exports.findYears = (cc, cb) => {
  var conn = null
  r.connect({db: 'course_plan'})
  .then((c) => {
    conn = c
    return r.table('plans').getAll(cc, {index: 'college'})('year')
            .distinct()
            .run(conn)
  })
  .then((cursor) => {
    return cursor.toArray()
  })
  .then((years) => {
    if (years.length === 0) {
      cb(404, {
        error: cc + ' is not a valid cc.'
      })
    } else {
      cb(200, years)
    }
  })
  .error((err) => {
    throw err
  })
  .finally(() => {
    if (conn) {
      conn.close()
    }
  })
}

module.exports.findUnis = (cc, year, cb) => {
  var conn = null
  r.connect({db: 'course_plan'})
  .then((c) => {
    conn = c
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
  .finally(() => {
    if (conn) {
      conn.close()
    }
  })
}

module.exports.findMajors = (cc, year, uni, cb) => {
  var conn = null
  r.connect({db: 'course_plan'})
  .then((c) => {
    conn = c
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
  .finally(() => {
    if (conn) {
      conn.close()
    }
  })
}

module.exports.findFault = (cc, year, uni, major, cb) => {
  // cb accepts a failure message
  if (!cc) {
    throw 'no cc passed to findFault'
  }
  var failureFound = false
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
  .finally(() => {
    if (conn) {
      conn.close()
    }
  })
}

module.exports.getPlan = (cc, year, uni, major, cb) => {
  var conn = null
  r.connect({db: 'course_plan'})
  .then((c) => {
    conn = c
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
  .finally(() => {
    if (conn) {
      conn.close()
    }
  })
}

module.exports.getUnits = (cc, year, course, cb) => {
  var conn = null
  r.connect({db: 'course_plan'})
  .then((c) => {
    conn = c
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
  .finally(() => {
    if (conn) {
      conn.close()
    }
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
  .then((c) => {
    conn = c
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
  .finally(() => {
    if (conn) {
      conn.close()
    }
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
  .then((c) => {
    conn = c
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
  .finally(() => {
    if (conn) {
      conn.close()
    }
  })
})

var addUnits = Promise.promisify((cc, year, course, units, cb) => {
  var conn = null
  r.connect({db: 'course_plan'})
  .then((c) => {
    conn = c
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
  .finally(() => {
    if (conn) {
      conn.close()
    }
  })
})

var addPlan = Promise.promisify((cc, year, uni, major, reqBody, cb) => {
  var conn = null
  r.connect({db: 'course_plan'})
  .then((c) => {
    conn = c
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
  .finally(() => {
    if (conn) {
      conn.close()
    }
  })
})