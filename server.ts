console.log('start');

import fs = require('fs');

var request = require('request');
var express = require('express')
var xmlbuilder = require('xmlbuilder');
var jpeg = require('jpeg-js');
var parseRange = require('range-parser')

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

app.use("/playlist", function(req, res, next) {
	var host = "http://" + req.headers.host;
	var hash = req.query.hash;
	console.log(req.headers);
	if (!req.query.noct || (req.headers["user-agent"] || "").indexOf("Chrome") == -1)
		res.type("video/x-ms-asf");

	if (req.query.starting) {
		res.send(createplaylist([
			//{ title: "Loading...", url: host + "/loading?hash=" + hash + "&starting=1&maxticks=30" },
			{ title: "Loading...", url: host + "/static/loadingbar.mp4" },
			{ title: "Playlist"  , url: host + "/playlist?hash=" + hash },
		]));
	} else {
		request.get(cfg.bthost + "/json/propertiesFiles/" + hash, function(err, httpResponse, body) {
			if (err)
				return res.send(err);
			var resp = JSON.parse(body);
			res.send(createplaylist(resp.map((e, i) => ({
				title: e.name,
				url: host + "/stream/" + encodeURIComponent(e.name) + "?hash=" + hash + "&file=" + i
			})).sort((a, b) => {
				var ta = a.title.toLowerCase();
				var tb = b.title.toLowerCase();
				if (ta.indexOf("sample") != tb.indexOf("sample"))
					return ta.indexOf("sample") == -1 ? -1 : 1;
				if (ta < tb)
					return -1;
				if (ta > tb)
					return 1;
				return 0;
			})));
		});
	}
});

app.use("/loadinghtml", function(req,res) {
	res.send(""
		+"<img src=\"loading\"/>"
		+"<br>"
		+"<a href=\"loading/test.mp4\">link<a/>"
	);
});

app.use("/loading", function(req,res) {
	console.log(req.method);
    var boundary = "boundarydonotcross";
    res.writeHead(200,{
        'Content-Type': 'multipart/x-mixed-replace;boundary="' + boundary + '"',
        'Connection': 'close',
//        'Expires': 'Fri, 01 Jan 1990 00:00:00 GMT',
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
        'Pragma': 'no-cache'
    });
    if (req.method == "HEAD")
	return res.end();

    var makedata = function(d) {
	var width = 320, height = 180;
	var frameData = new Buffer(width * height * 4);
	var i = 0;
	while (i < frameData.length) {
	  frameData[i++] = 0xFF; // red
	  frameData[i++] = i & 0xFF; // green
	  frameData[i++] = (d*200)&0xff; // blue
	  frameData[i++] = 0xFF; // alpha - ignored in JPEGs
	}
	var rawImageData = {
	  data: frameData,
	  width: width,
	  height: height
	};
	return jpeg.encode(rawImageData, 50).data;
    };
    var data = makedata(0);
    var dx = 0;
    var busy = false;
    var frames = 0;
    var lastts = (new Date().getTime());
    setInterval(function() {
	data = makedata(++dx);
	dowrite();
return;
	var newts = (new Date().getTime());
	var i = 0;
	while (lastts < newts) {
		lastts += (1000 / 25);
		dowrite();
		++i;
	}
	console.log('tick ' + frames + ' ' + i + ' ' + i*data.length );
    }, 1000);
/*
    setInterval(function() {
	++frames;
	if (busy)
		console.log('busy');
	else
		dowrite();
    }, 1000 / 25);
*/
console.log(typeof data);

    res.write('--'+boundary+'\n');

	var dowrite = function() {
		var nd = true;
		nd = nd && res.write('Content-Type: image/jpeg\n Content-Length: '+data.length+'\n\n');
		nd = nd && res.write(data);
		nd = nd && res.write('\n--'+boundary+'\n');

		busy = !nd;
		return;
		if (!nd) {
			console.log('drain');
			res.once('drain', dowrite);
		} else {
			console.log('nodrain');
			setImmediate(dowrite);
		}
	};
for (var i = 0; i < (1000 / 5); ++i)
	dowrite();
});

app.use("/stream", function(req, res, next) {
	console.log(req.query.hash);
	console.log(req.query.file);
	var hash = req.query.hash;
	var file = req.query.file;
	request.get(cfg.bthost + "/json/propertiesFiles/" + hash, function(err, httpResponse, body) {
		if (err)
			return res.send(err);
		var info = JSON.parse(body)[file];
/*
		var range = parseRange(info.size_bytes, req.headers.range || "bytes=0-")[0];
		var offset = range.begin;
		var length = range.end - range.begin + 1;

		res.type(info.name);
		res.header("Accept-Ranges", "bytes");
		res.header("Content-Length", length);

		if (req.method == "HEAD")
			return res.end();
*/
		request.get(cfg.bthost + "/updateprio/" + hash + "/" + file + "?offset=0&prev=-2", function(err, httpResponse, body) {
			if (err)
				return res.send(err);
			var resp = JSON.parse(body);


			if (info.size_bytes == resp.max_length)
				res.download(info.file_path);
			else
				res.send(JSON.stringify(info) + body);
		});
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

function createplaylist(entries)
{
	var xml = xmlbuilder.create({
		asx: {
			"@version": "3.0",
			"#list": entries.map(e => ({ entry: { title: e.title, ref: { "@href": e.url } } }))
		}
	}).end({ pretty: true });
	return xml;
}

function isplayable(ext) {;
	return -1 != [
"3GP", "AAC", "AC3" , "AIF", "AIFC", "AIFF", "ASF",
"AU",  "AVI", "FLAC", "FLV", "M3U" , "M4A" , "M4P",
"M4V", "MID", "MKV" , "MOV", "MP2" , "MP3" , "MP4",
"MPC", "MPE", "MPEG", "MPG", "MPP" , "OGG" , "OGM",
"OGV", "QT" , "RA"  , "RAM", "RM"  , "RMV" , "RMVB",
"SWA", "SWF", "VOB" , "WAV", "WMA" , "WMV",
	].indexOf(ext.toUpperCase());
}
