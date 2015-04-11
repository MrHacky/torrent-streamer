"use strict"

var spawn = require('child_process').spawn;
var fs = require('fs');
var co = require('co');
var tmp = require('tmp')

var frame = new Buffer(new Array(16 * 16 * 3).map(() => 0));

function getargs(opts)
{
	var ret = "";
	ret += " -ss 0 -re -analyzeduration 1";
	ret += " -f rawvideo -vcodec rawvideo -r 2 -pix_fmt rgb24 -s 16x16 -i -";
	ret += " -vf scale=w=704:h=576";
	ret +=  ",drawtext=fontfile=./FreeSerif.ttf";
	ret +=   ":textfile=" + opts.textfile + ":reload=1";
	ret +=   ":fontsize=30";
	ret +=   ":fontcolor=white";
	ret +=  ",drawtext=fontfile=./FreeSerif.ttf";
	ret +=   ":text=%{localtime\\\\:%T}";
	ret +=   ":fontsize=30";
	ret +=   ":fontcolor=white";
	ret +=  ",fps=fps=4"
	ret +=  ",select=gte(n\\,8)";

	ret += " -s 704x576";
	ret += " -f matroska -vcodec png -"
	return ret.split(" ").slice(1);
}

function dospawnimpl() {
	var tmpfile = tmp.fileSync({ prefix: "text2video.", postfix: ".txt", keep: true });
	fs.writeFileSync(tmpfile.name, "\n");
	var s = spawn("ffmpeg", getargs({ textfile: tmpfile.name }));
	s.tmpfile = tmpfile;
//	s.stderr.pipe(process.stderr);
	s.stdin.write(frame);
	s.stdin.write(frame);
	s.stdin.write(frame);
	s.stdin.write(frame);
/*
	s.stdin.write(frame);
	s.stdin.write(frame);
	s.stdin.write(frame);
	s.stdin.write(frame);
*/
	console.log("ffmpeg-spawned");
	return s;
}

var procs = [ dospawnimpl(), dospawnimpl(), dospawnimpl(), dospawnimpl(), dospawnimpl() ];

co(function*() {
        while (true) {
                if (procs.length < 10) {
                        console.log("starting proc: " + procs.length);
                        procs.push(dospawnimpl());
                }
                yield sleep(10000);
        }
}).catch(e => console.log(""+e));

function dospawn() {
	return procs.length > 0 ? procs.shift() : dospawnimpl();
}

//console.log(getargs({ textfile: "test.txt" }));

function text2video(res)
{
	var ffmpeg = dospawn();
	var tmpfile = ffmpeg.tmpfile;
	ffmpeg.stdout.pipe(res);
	ffmpeg.stdout.on("end", function() {
		console.log("end event!");
		res.end();
	});

	var done = false;
	res.on("finish", () => { console.log("ffmpeg-finish"); done = true; });
	res.on("error" , () => { console.log("ffmpeg-error" ); done = true; });
	co(function*() {
		while (!done) {
			//console.log(new Date().getTime());
			ffmpeg.stdin.write(frame);
			ffmpeg.stdin.write(frame);
			yield sleep(1000);
		}
		ffmpeg.stdin.end();
	});

	return {
		write: function(text) {
			if (typeof text == "object" && text.length)
				text = text.join("\n");
			fs.writeFileSync(tmpfile.name, "\t\t\t\t"+text);
		},
		stop: function() {
			done = true;
		},
		done: function() {
			return done;
		},
	};
}

module.exports = text2video;

function sleep(ms)
{
        return new Promise((resolve, reject) => {
                setTimeout(resolve, ms);
        });
}

