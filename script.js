var ccs = require("./data/ccs.json")

//console.log(ccs)

var compiled = []

Object.keys(ccs["diablovalleycollege"]["15-16"]).forEach((crs) => {
  compiled.push({
    cc: "diablovalleycollege",
    year: "15-16",
    course: crs,
    units: ccs["diablovalleycollege"]["15-16"][crs]
  })
})

console.log(compiled)