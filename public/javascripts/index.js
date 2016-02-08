// TODO the structure of the plans json is just messed up. Really the course lists
// should be in their own object so you don't have to worry about "name" showing up
// as what could be considered a course
// TODO add course agreement plan year
// TODO include unit count for each course for /plan/ endpoint and for front end as
// well. what the fuck was i thinking?

$(function() {
  var nextRowNum = 1;
  loadCCs();
  
  $('body').on('change', '.college-select', function() {
    clearRows();
    nextRowNum = 1;
    /*$('.x-container').remove();
    $('.uni-major .select').remove();
    $('.uni-major br').remove();
    nextRowNum = 0;
    addRow(nextRowNum++);
    loadYears(loadUnis);*/
  });
  
  $('body').on('change', '.year-select', function() {
    clearRows();
    nextRowNum = 1;
  });
  
  $('body').on('change', '.uni-select', function() {
    var rowNum = $(this).attr('class').split('row-')[1].split(' ')[0];
    
    loadMajors(rowNum);
  });
  
  $('body').on('click', '.x-container', function() {
    var rowNum = $(this).attr('class').split('row-')[1].split(' ')[0];
    $('.row-' + rowNum).remove();
  });

  $('.plus').click(function() {
    addRow(nextRowNum++);
    loadUnis();
  });
  
  $('.find-plan-btn').click(function() {
    $('.course-boxes').empty();
    addCourses();
    $('.courses').css('display', 'inline-block');
  });
});

function loadOptions(loadUrl, addSelect, addCondition) {
  var selects = $(addSelect);
  selects.empty();
  if (addCondition) {
    selects.append('<option value=""></option>');
    $.ajax({
      url: loadUrl,
      type: 'GET'
    }).done(function(data) {
      var html = '';
      Object.keys(data).forEach(function(key) {
        html += '<option value="' + key + '">' + data[key] + '</option>';
      });
      selects.append(html);
    });
  }
}

function loadCCs() {
  // endpoint for cc list is /ccs/, add items to college select box,
  // there is no condition to be met to add the ccs
  loadOptions('/ccs/', '.college-select', true);
}

function loadUnis() {
  // endpoint for uni list is /unis/cc/, add items to uni select box
  // add options only if the non-blank cc option was selected
  var url = '/unis/' + $('.college-select').val() + '/' + $('.year-select').val() + '/';
  loadOptions(url,
    '.uni .select:last-of-type select', 
    $('.college-select').val() !== ''
  );
}

function loadYears(cb) {
  var college = $('.college-select').val();
  $('.year-select').empty();
  if (college === '')
    return;
  $.ajax({
    url: '/years/' + college,
    type: 'GET'
  }).done(function(data) {
    var html = '';
    data.forEach(function(yr) {
      html += '<option value="' + yr + '">' + yr + '</option>';
    });
    $('.year-select').append(html);
    cb();
  });
}

function loadMajors(rowNum) {
  // accepts a jquery selector for the row
  // endpoint for majors is /majors/cc/uni/, add items to major select box
  // add options only if non-blank cc and unis were selected
  var majorSelect, uniSelect, collegeSelect, yearSelect, url;
  yearSelect = $('.year-select');
  collegeSelect = $('.college-select');
  majorSelect = $('.major .row-' + rowNum + ' select');
  uniSelect = $('.uni .row-' + rowNum + ' select');
  url = '/majors/' + collegeSelect.val() + '/' + yearSelect.val() + '/' +
    uniSelect.val();
  
  loadOptions(url,
    majorSelect,
    $('.college-select').val() !== '' && uniSelect.val() !== ''
  );
}

function addRow(rowNum) {
  $('.uni').append(
    '<div class="x-container row-' + rowNum + '">' +
      '<div class="x"> x </div>' +
    '</div>' +
    '<div class="select row-' + rowNum + '">' +
      '<select class="uni-select row-' + rowNum + '"></select>' +
    '</div>' +
    '</div>' +
    '<br class=row-' + rowNum + '>'
  );
  $('.major').append(
    '<div class="select row-' + rowNum + '">' +
      '<select class="major-select row-' + rowNum + '"></select>' +
    '</div>' +
    '<br class=row-' + rowNum + '>'
  );
}

function addCourses() {
  var uniMajors = '';
  
  $('.uni .select select').each(function() {
    var rowNum = $(this).parent().attr('class').split('-')[1];
    
    var uni, major;
    uni = $(this).val();
    major = $('.major .row-' + rowNum + ' select').val();
    
    if (uni !== '' && major !== '')
      uniMajors += uni + ',' + major + '/';
  });
  
  if (uniMajors !== '') {
    url = '/plan/' + $('.college-select').val() + '/' + 
      $('.year-select').val() + '/' + uniMajors;
    $.ajax({
      url: url,
      type: 'GET'
    }).done(function(data) {
      keySort(data).forEach(function(crs) {
        var units, unis;
        units = data['courses'][crs]['units'];
        unis = data['courses'][crs]['unis'];
        addBox(units, crs, unis);
      });
    });
  }
}

function keySort(data) {
  return Object.keys(data['courses']).sort(function(k1, k2) {
    // first sort by number of unis requiring the course
    if (data['courses'][k1]['unis'].length < data['courses'][k2]['unis'].length)
      return 1;
    if (data['courses'][k1]['unis'].length > data['courses'][k2]['unis'].length)
      return -1;
    // if # of unis is same, sort alphanumerically ('A1' < 'A2' < 'B1')
    if (k1 < k2)
      return -1;
    if (k1 > k2)
      return 1;
    return 0;
  });
}

function addBox(units, name, unis) {
  var html =
    '<div class="box">' +
      '<ul>' +
        '<li class="units">' + units + '</li>' +
        '<li class="name">' + name + '</li>' +
        '<li class="logos">';
  unis.forEach(function(uni) {
    html += '<img height="25px" src="/logos/' + uni + '.png"></img>';
  });
  html += '</li></ul></div>';
  
  $('.course-boxes').append(html);
}

function clearRows() {
  $('.x-container').remove();
  $('.uni-major .select').remove();
  $('.uni-major br').remove();
  addRow(0);
  loadYears(loadUnis);
}