"use strict"

console.log('start');

var fs = require('fs');
var co = require('co');

var request = require('request');
var express = require('express')
var xmlbuilder = require('xmlbuilder');
var parseRange = require('range-parser')

var TorrentServer = require("./torrentserver.js");
var text2video = require("./text2video.js");

require('longjohn');

var cfg = {
	bthost: 'http://pi2-gentoo.local:8081'
};

var btserver = new TorrentServer(cfg.bthost);

var app = express();

app.use(function(req, res, next) {
	console.log(req.method + ": " + req.url);
	next();
});

//app.use("/test", Streamer);

var staticpath = '/media/simon/INTENSO4/Downloads';
app.use('/static', function(req, res, next) {
	var reqpath = decodeURIComponent(req.path);
	var path = staticpath + reqpath;
	//console.log(path);
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
	var murl = req.url.slice(1);
	var hash = req.query.xt;
	if (hash.slice(0, 9) == 'urn:btih:')
		hash = hash.slice(9);
	if (hash.length == 32)
		hash = base32tohex(hash);
	console.log(hash + ": " + murl);

	res.redirect("/playlist" + "?starting=1&hash=" + hash);

	var url = cfg.bthost + "/command/download";
	console.log(url);
	request.post(url, { form: { urls: murl } }, function(err, httpResponse, body) {
		if (err)
			console.log("failed to start torrent download");
		else
			console.log("OK:" + JSON.stringify(body));
	});
});

app.use("/playlist", function(req, res, next) {
	var host = "http://" + req.headers.host;
	var hash = req.query.hash;
	//console.log(req.headers);
	if (!req.query.noct || (req.headers["user-agent"] || "").indexOf("Chrome") == -1)
		res.type("video/x-ms-asf");

	if (req.method == "HEAD")
		return res.end();

	if (req.query.starting) {
		res.send(createplaylist([
			{ title: "Loading...", url: host + "/loading?hash=" + hash + "&starting=1&maxticks=30" },
			//{ title: "Loading...", url: host + "/static/loadingbar.mp4" },
			{ title: "Playlist"  , url: host + "/playlist?hash=" + hash },
		]));
	} else {
		btserver.files(hash).then(resp => {
			if (!resp)
				throw "unknown torrent";
			resp = resp.map((e) => ({
				url: host + "/stream/" + encodeURIComponent(e.name) + "?hash=" + hash + "&file=" + e.index,
				title: e.name,
			}));
			resp.push({
				url: host + "/loading?hash=" + hash,
				title: "Done...",
			});
			res.send(createplaylist(resp));
		}, (e) => res.status(500).json({ error: "" + e }));
	}
});

app.use("/loading", function(req, res, next) {
        if (!req.query.noct || (req.headers["user-agent"] || "").indexOf("Chrome") == -1) {
        } else {
                res.send("testing");
                return;
        }
	res.type("mkv");
        if (req.method == "HEAD")
                return res.end();


	var t2v = text2video(res);
	var text = ["test", "Waiting for metadata..." ]
	t2v.write(text);

	var done = false;
	req.on("close", () => { console.log("ffmpeg-close"); t2v.stop(); });
	req.on("end"  , () => { console.log("ffmpeg-end"  ); t2v.stop(); });


	co(function*() {
		while (!t2v.done()) {
			var data = yield btserver.dorequest("/json/transferInfo");
			data = JSON.parse(data);
			text[0] = ("" + (data.ul_alltime / data.dl_alltime)).slice(0, 5) + "\t" + (0|(data.dl_speed / 1024)) + "/" + (0|(data.ul_speed / 1024));
			t2v.write(text);
			yield sleep(3000);
		}
	});

	var hash = req.query.hash;
	co(function*() {
		var info;
		while (!info) {
			info = yield btserver.files(hash);
			text[2] = "reponse: " + (info && info.length);
			t2v.write(text);
		}

		text = text.slice(0, 2).concat(info.map(e => e.progress + "\t" + e.name));
		text[1] = "Got metadata";
		t2v.write(text);

		if (!info[0] || req.query.starting != 1)
			return;
		var file = info[0].index;
		var target = info[0].size_bytes / 200;

		text[1] = "target: ?\t?/" + target;
		t2v.write(text);

		var limit = 0;
		var prio = -1;
		while (limit < target && !t2v.done()) {
			var response = yield btserver.updateprio(hash, file, limit, prio);
			console.log(response);
			prio = response.new;
			limit += response.max_length;
			text[1] = (0|(limit * 1000 / target)) + "\ttarget: " + limit + '/' + target;
			t2v.write(text);
			if (response.max_length == 0)
				yield sleep(1000);
		}
		t2v.stop();
		if (prio != -1)
			yield btserver.updateprio(hash, file, info[0].size_bytes, prio);
	});
});

app.use("/stream", function(req, res, next) {
	console.log(req.query.hash);
	console.log(req.query.file);
	var hash = req.query.hash;
	var file = req.query.file;

	btserver.file(hash, file).then((info) => {
		var range = parseRange(info.size_bytes, req.headers.range || "bytes=0-")[0];
		var offset = range.start;
		var length = range.end - range.start + 1;

		res.status(req.headers.range ? 206 : 200);
		res.type(info.name);
		res.header("Accept-Ranges", "bytes");
		res.header("Content-Length", length);
		res.header("Content-Range", "bytes " + range.start + "-" + range.end + "/" + info.size_bytes);
		res.header("Connection", "close");

		if (req.method == "HEAD")
			return res.end();
		console.log(range);

		var bufdata = [];
		var bufsize = 0;
		var cv = condvar();

		// write coroutine
		co(function*() {
			var drain = Drainer(req, res);
			var todo = length;
			console.log("writer: todo=" + todo);
			while (todo > 0) {
				//console.log("writer: todo=" + todo);
				yield cv.wait(() => bufsize > 0);
				//console.log("writer: bufsize=" + bufsize);
				var b = bufdata.shift();
				bufsize -= b.length;
				todo -= b.length;
				cv.notify();
				//console.log("writer: b.length=" + b.length);
				if (!res.write(b))
					yield drain();
			};
			console.log("writer done");
			res.end();
		}).catch(e => {
			console.log("write error:" + e);
			cv.abort("write error:" + e);
			res.end();
		});

		// read coroutine
		co(function*() {
			var offs = offset;
			var todo = length;
			var limit = btserver.getlimit(hash, file, offs);
			var prio = -1;

			console.log("reader: todo=" + todo);
			console.log("reader: limit=" + limit);
			while (todo > 0) {
				//console.log("reader: todo=" + todo);
				yield cv.wait(() => bufsize < 5*1024*1024);
				console.log("reader: bufsize1=" + bufsize);
				//console.log("reader: limit=" + limit);

				while (limit == 0) {
					var response = yield btserver.updateprio(hash, file, offs, prio);
					console.log(response);
					console.log("reader: bufsize2=" + bufsize);
					prio = response.new;
					limit = response.max_length;
					if (limit == 0)
						yield sleep(1000);
				}
				var count = Math.min(512*1024, bufsize + 32*1024, limit, todo);
				var data = yield readfromfile(info.file_path, { start: offs, end: offs + count - 1 });
				//console.log("reader: count=" + count + " " + data.length);
				for (var i = 0; i < data.length; ++i) {
					var dl = data[i].length;
					bufdata.push(data[i]);
					bufsize += dl;
					offs += dl;
					limit -= dl;
					todo -= dl;
				}
				//console.log("reader: bufsize!=" + bufsize);
				cv.notify();
			}
			console.log("reader done");
		}).catch(e => {
			console.log("read error:" + e);
			cv.abort("read error:" + e);
		});

	}, (e) => res.status(500).json({ error: "" + e }));
});

var server = app.listen(3000, function () {

  var host = server.address().address
  var port = server.address().port

  console.log('Example app listening at http://%s:%s', host, port)

});

function base32tohex(s)
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

function sleep(ms)
{
	return new Promise((resolve, reject) => {
		setTimeout(resolve, ms);
	});
}

function condvar()
{
	var cv = {
		list: [],
		error: null,
		wait: co.wrap(function*(test) {
			while (!cv.error && !test())
				yield new Promise((resolve, reject) => cv.list.push(resolve));
			if (cv.error)
				throw cv.error;
		}),
		notify: function() {
			var l = cv.list;
			cv.list = [];
			l.map(f => f());
		},
		abort: function(err) {
			cv.error = err || "Aborted";
			cv.notify();
		},
	};
	return cv;
}

function readfromfile(path, opts) {
	return new Promise((resolve, reject) => {
		var ifs = fs.createReadStream(path, opts);
		var ret = [];
		ifs.on  ("data" , (c) => ret.push(c));
		ifs.once("error", (e) => reject(e));
		ifs.once("end"  , ()  => resolve(ret));
	});
};

function Drainer(req, res)
{
	var ended = false;
	var rejecter = null;

	var cb = () => {
		ended = true;
		rejecter && rejecter("Closed");
		rejecter = null;
	};

	res.on("finish", cb);
	res.on("error" , cb);
	req.on("close" , cb);
	req.on("end"   , cb);

	return () => new Promise((resolve, reject) => {
		rejecter = reject;
		if (ended)
			cb();
		else
			res.once("drain", resolve)
	});
};
