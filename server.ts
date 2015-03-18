console.log('start');

import fs = require('fs');
var request = require('request');

var express = require('express')

var cfg = {
	bthost: 'http://pi2-gentoo.local:8081'
};

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
					(x) => '<a href="/static' + req.path + '/' + encodeURIComponent(x) + '">' + x + '</a>'
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

app.use('/start/redir.playlist', function(req, res, next) {
	if (req.path != "/magnet:")
		return next();
	var url = req.url.slice(1);
	var hash = req.query.xt;
	if (hash.slice(0, 9) == 'urn:btih:')
		hash = hash.slice(9);
	if (hash.length == 32)
		hash = base32tohex(hash);
	console.log(url);
	console.log(hash);

	request.post(cfg.bthost + "/command/download", { form: { urls: url } }, function(err, httpResponse, body) {
		if (err)
			return res.send(err);
		res.redirect("/playlist" + "?starting=1&hash=" + hash);
	});
});

var server = app.listen(3000, function () {

  var host = server.address().address
  var port = server.address().port

  console.log('Example app listening at http://%s:%s', host, port)

});

function base32tohex(s: string): string
{
	var alfa = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
	var hex = "0123456789abcdef";
	var ret = "";
	var acc = 0;
	var bits = 0;
	s = s.toUpperCase();
	for (var i = 0; i < 32; ++i) {
		var val = alfa.indexOf(s[i]);
            acc = (acc << 5) | val;
            bits += 5;
            while (bits >= 4) {
                var nibble = (acc >> (bits - 4)) & 0x0f;
                ret += hex[nibble];
                bits -= 4;
            }
        }
        return ret;
}
