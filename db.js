// TODO add setup function to create table, secondary indexes
var r = require('rethinkdb')


module.exports.findCcs = function(cb) {
  onConnect((conn) => {
    // get all unique colleges
    r.table('plans').distinct({index: 'college'}).run(conn, (err, cursor) => {
      if (err)
        throw err
      cursor.toArray((err, result) => {
        if (err)
          throw err
        // for each unique college, get its real (formatted) name and add it
        var ccs = {}
        var added = 0
        result.forEach((college) => {
          r.table('plans').getAll(college, {index: 'college'}).pluck('college_name').run(conn, (err, cursor) => {
            cursor.next((err, row) => {
              if (err)
                throw err
              ccs[college] = row['college_name']
              added += 1
              if (added === result.length)
                cb(ccs)
            })
          })
        })
      })
    })
  })
}

module.exports.findYears = function(cc, cb) {
  onConnect((conn) => {
    r.table('plans').getAll(cc, {index: 'college'}).pluck('year').distinct().run(conn, (err, cursor) => {
      return cursor.toArray()
    }).then((result) => {
      cb(result.map((el) => {
        return el['year']
      }))
    }).error((err) => {
      throw err
    })
  })
}

module.exports.findUnis = function(cc, year, cb) {
  onConnect((conn) => {
    r.table('plans').getAll([cc, year], {index: 'college_year'}).pluck('uni').distinct().run(conn, (err, cursor) => {
      return cursor.toArray()
    }).then((result) => {
      cb(result.map((el) => {
        return el['uni']
      }))
    }).error((err) => {
      throw err
    })
  })
}
/*
module.exports.findUnis = function(cc, year, cb) {
  onConnect((conn) => {
    console.log('ok')
    r.table('plans').getAll([cc, year], {index: 'college_year'}).pluck('uni').distinct().run(err, cursor) => {
      return cursor.toArray()
    }).then((result) => {
      cb(result.map((el) => {
        return el['uni']
      }))
    }).error((err) => {
      throw err
    })
  })
}
*/

function onConnect(cb) {
  r.connect({db: 'course_plan'}, (err, conn) => {
    if (err)
      throw err
    cb(conn)
  })
}