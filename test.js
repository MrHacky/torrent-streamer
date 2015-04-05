
var co = require("co");
var fs = require("fs");

function sleep(ms)
{
	return new Promise((resolve, reject) => {
		setTimeout(resolve, ms);
	});
}

//console.log("hello");
//sleep(1000).then(() => console.log("world"));

var buf = [];
var bufsize = 0;
var cv = {
	list: [],
	wait: function(test) {
		return co(function*() {
			while (!test()) {
				yield new Promise((resolve, reject) => cv.list.push(resolve) );
			}
		})
	},
	notify: function() {
		var l = cv.list;
		cv.list = [];
		l.map(f => f());
	},
};

co(function*() {
	console.log("hello1");
	while (true) {
		yield cv.wait(() => bufsize > 0);
		console.log("world1");
		console.log(buf.shift());
		--bufsize;
		cv.notify();
	}
});

co(function*() {
	var i = 0;
	console.log("hello2");
	while (true) {
		yield cv.wait(() => bufsize < 10*1024*1024);
		yield sleep(1000);
		buf.push(++i);
		++bufsize;
		cv.notify();
		console.log("world2");
	}
});

function readfromfile(path, opts) {
	return new Promise((resolve, reject) => {
		var ifs = fs.createReadStream("test.txt", opts);
		var ret = [];
		ifs.on  ("data" , (c) => ret.push(c));
		ifs.once("error", (e) => reject(e));
		ifs.once("end"  , ()  => resolve(ret));
	});
};

co(function*() {
	console.log(yield rff("test.txt", { start: 1, end: 4 }));
});
