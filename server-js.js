console.log('start');

var fs = require('fs');
var express = require('express')

var app = express();
var static = '/media/simon/INTENSO4/Downloads';
app.use('/static', function(req, res, next) {
	var reqpath = decodeURIComponent(req.path);
	var path = static + reqpath;
	console.log(path);
	fs.stat(path + '/', function(err, stats) {
		if (err) {
			//res.send(err)
			next();
		} else if (stats.isDirectory()) {
			fs.readdir('/media/simon/INTENSO4/Downloads' + reqpath, function(err, files) {
				var ret = files.map(
					function(x) { return '<a href="/static' + req.path + '/' + encodeURIComponent(x) + '">' + x + '</a>'; }
				).join('<br>\n');
				res.send(ret);
			});
		} else
			next();
	});
});
app.use('/static', express.static('/media/simon/INTENSO4/Downloads'));
app.get('/', function (req, res) {
  res.send('Hello World!')
})

var server = app.listen(3000, function () {

  var host = server.address().address
  var port = server.address().port

  console.log('Example app listening at http://%s:%s', host, port)

});
