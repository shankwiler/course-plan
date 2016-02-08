$(function() {
  var submitUrl;
  
  loadOptions('.college-select', '/parser/ccs/');
  
  $('body').on('change', '.college-select', function() {
    $('.year-select, .uni-select, .major-select, .messages, .data textarea').empty();
    loadOptions('.year-select', '/parser/years/' + $('.college-select').val());
  });
  
  $('body').on('change', '.year-select', function() {
    $('.uni-select, .major-select, .messages, .data textarea').empty();
    loadOptions('.uni-select', '/parser/unis/' + $('.year-select').val());
  });
  
  $('body').on('change', '.uni-select', function() {
    $('.major-select, .messages, .data textarea').empty();
    var url = '/parser/majors/' + $('.uni-select').val();
    loadOptions('.major-select', url,  function(data) {
      if (!data.submitUrl) {
        console.log('error no submit url returned from server');
        return;
      }
      submitUrl = data.submitUrl;
    });
  });
  
  $('body').on('change', '.major-select', function() {
    if (!submitUrl) {
      console.log('Error, submit url never found.');
      return;
    }
    $('.messages, .data textarea').empty();
    submitUrl += '&dora=' + $('.major-select').val();
    $.ajax({
      url: '/parser/data/' + getSelectedUrl(),
      type: 'GET'
    }).done(function(data) {
      $('.messages').append('<p>data found, update info if you\'d like</p>');
      $('.courses').append(JSON.stringify(data['courses'], null, 2));
      $('.units').append(JSON.stringify(data['units'], null, 2));
    }).error(function() {
      $.ajax({
        url: '/parser/guess/' + submitUrl,
        type: 'GET'
      }).done(function(data) {
        $('.messages').append('<p>data not found, best guess shown</p>');
        $('.courses').append(JSON.stringify(data['plan'], null, 2));
        $('.units').append(JSON.stringify(data['units'], null, 2));
      });
    });
    $.ajax({
      url: '/parser/plan/' + submitUrl,
      type: 'GET'
    }).done(function(data) {
      $('.plan').attr('src', data);
      // This will be done with an external stylesheet later.
      $('body, html').css('min-height', '100%');
      $('.plan').css({
        'width': '500px',
        'min-height': '600px'
      });
    });
  });
  
  $('.data').submit(function(e) {
    e.preventDefault();
    $.ajax({
      url: '/parser/data/' + getSelectedUrl(),
      type: 'POST',
      data: {
        college_name: $('.college-select option:selected').text(),
        uni_name: $('.uni-select option:selected').text().split('To:')[1].trim(),
        major_name: $('.major-select option:selected').text(),
        courses: $('.courses').val(),
        units: $('.units').val()
      }
    }).done(function() {
      console.log('success');
    });
  });
});

function loadOptions(select, url, cb) {
  var selectBox = $(select);
  selectBox.empty();
  $.ajax({
    url: url,
    type: 'GET'
  }).done(function(data) {
    selectBox.append('<option selected="selected"></option>');
    data.opts.forEach(function(optionData) {
      selectBox.append(
        '<option value="' + optionData.link + '">' +
          optionData.name +
        '</option>'
      );
    });
    if (cb)
      cb(data);
  });
}

function getSelectedUrl() {
  return simplify($('.college-select :selected').text()) + '/' +
    $('.year-select :selected').text() + '/' +
    simplify($('.uni-select :selected').text()) + '/' +
    simplify($('.major-select :selected').text());
}

function simplify(str) {
  return str.replace(/^\s*To:/,'').toLowerCase().replace(/[^a-z]/ig, '');
}