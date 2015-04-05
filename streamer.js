"use strict"

// cat file3.raw | avconv -f rawvideo -vcodec rawvideo -pix_fmt rgb24 -s 4x4 -i - -s 160x100 -f flv - > out.flv^C
var spawn = require('child_process').spawn;
var fs = require('fs');
var co = require('co');

var iargs = [ "-ss", "0", "-analyzeduration", "1", "-f", "rawvideo", "-vcodec", "rawvideo"
	, "-r", "2", "-pix_fmt", "rgb24", "-s", "4x4", "-i", "-" ];
//var oargs = [ "-s", "128x96", "-r", "10", "-f", "flv", "-vcodec", "flv", "-"];
var oargs = [ "-s", "128x96", "-r", "10", "-f", "asf", "-vcodec", "h263", "-"];
var args = [].concat(iargs).concat(oargs);

var procs = [];
var frame = [
        0xff, 0x00, 0x00,   0x00, 0xff, 0x00,  0x00, 0x00, 0xff,  0xff, 0x00, 0xff,
        0xff, 0x00, 0x00,   0x00, 0xff, 0x00,  0x00, 0x00, 0xff,  0xff, 0x00, 0xff,
        0xff, 0x00, 0x00,   0x00, 0xff, 0x00,  0x00, 0x00, 0xff,  0xff, 0x00, 0xff,
        0xff, 0x00, 0x00,   0x00, 0xff, 0x00,  0x00, 0x00, 0xff,  0xff, 0x00, 0xff,
];
var fb1 = new Buffer(frame);
frame.shift();
frame.push(0xff);
var fb2 = new Buffer(frame);

function dospawn() {
	var s = spawn('avconv', args);
	s.stdin.write(fb1);
	s.stdin.write(fb2);

	//s.stdin.end();
	s.stderr.pipe(process.stderr);
	//s.stdout.pipe(fs.createWriteStream('/dev/null'));
	return s;
};

co(function*() {
	while (true) {
		if (procs.length < 3) {
			console.log("starting proc: " + procs.length);
			procs.push(dospawn());
		}
		yield sleep(10000);
	}
}).catch(e => console.log(""+e));


function sleep(ms)
{
	return new Promise((resolve, reject) => {
		setTimeout(resolve, ms);
	});
}

function use(req, res, next) {
	if (!req.query.noct || (req.headers["user-agent"] || "").indexOf("Chrome") == -1) {
	} else {
		res.send("testing");
		return;
	}
	res.type("asf");
	if (req.method == "HEAD")
		return res.end();

	console.log(req.headers);

	console.log(procs.length > 0);
	var avconv = procs.length > 0 ? procs.shift() : dospawn();
	avconv.stdout.pipe(res);

	co(function*() {
		//yield sleep(10000);
		//console.log('toolate');
		avconv.stdin.write(fb2);
		avconv.stdin.write(fb2);
		for (let i = 0; i < 15; ++i) {
			yield sleep(1000);
			avconv.stdin.write(fb1);
			avconv.stdin.write(fb1);
			yield sleep(1000);
			avconv.stdin.write(fb2);
			avconv.stdin.write(fb2);
		}
		avconv.stdin.end();
	}).catch(e => console.log(""+e));
}

module.exports = use;
