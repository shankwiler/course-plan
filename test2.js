var Promise = require('bluebird')
/*
function test(cb) {
  console.log('in test')
  cb('this is an error from test', 'passed from test')
}

function test2(cb) {
  console.log('in test2')
  cb()
}

var pTest = Promise.promisify(test)

pTest()
.then((result) => {
  console.log(result)
})
.error((err) => {
  throw err
})*/

var a = [{
  'a':1
}]

Promise.map([0], (ind) => {
  var el = a[ind]
  a[ind] = {
    4:el['a']
  }
  console.log(el)
})
.then(() => {
  console.log(a)
})

