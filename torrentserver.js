"use strict"

var request = require('request');
var co = require('co');

function sleep(ms)
{
	return new Promise((resolve, reject) => {
		setTimeout(resolve, ms);
	});
}

function dorequest(url, postdata)
{
	return new Promise((resolve, reject) => {
		console.log("url: " + url);
		var cb = function(err, httpResponse, body) {
			console.log(err || "OK");
			if (err)
				reject(err);
			else
				resolve(body)
		};
		if (!postdata)
			request.get(url, cb);
		else
			request.post(url, postdata, db);
	});
}

function isplayable(ext)
{
	return -1 != [
"3GP", "AAC", "AC3" , "AIF", "AIFC", "AIFF", "ASF",
"AU",  "AVI", "FLAC", "FLV", "M3U" , "M4A" , "M4P",
"M4V", "MID", "MKV" , "MOV", "MP2" , "MP3" , "MP4",
"MPC", "MPE", "MPEG", "MPG", "MPP" , "OGG" , "OGM",
"OGV", "QT" , "RA"  , "RAM", "RM"  , "RMV" , "RMVB",
"SWA", "SWF", "VOB" , "WAV", "WMA" , "WMV",
	].indexOf(ext.toUpperCase());
}

function tryparse(json, def)
{
	try {
		return JSON.parse(json);
	} catch (e) {
		return def;
	}
}

class TorrentServer {
	constructor(host)
	{
		this._host = host;
		this._info = {};
	};

	_getinfo(hash)
	{
		if (!this._info[hash])
			this._info[hash] = { files: null, limits: {} };
		return this._info[hash];
	}

	filesraw(hash)
	{
		var ti = this._getinfo(hash);
		if (!ti.files) {
			var url = this._host + "/json/propertiesFiles/" + hash;
			var timeout = false;
			ti.files = co(function*() {
				let r = [];
				while (!r.length && !timeout) {
					r = tryparse(yield dorequest(url), []);
					if (!r.length)
						yield sleep(1000);
				}
				if (!r.length) {
					ti.files = null; // uncache failure status
					throw "Unknown torrent";
				} else
					return r;
			});
			sleep(15000).then(() => {
				timeout = true;
			});
		}
		return ti.files;
	};

	files(hash)
	{
		return this.filesraw(hash).then(d => {
			return d.map((e, i) => ({
				title: e.name,
				index: i,
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
			}).filter((e) => isplayable(e.title.match(/([^\.]*)$/)[1]))
		});
	}

	file(hash, file)
	{
		return this.filesraw(hash).then(d => {
			if (d[file])
				return d[file];
			else
				throw "Invalid file index";
		});
	}

	updateprio(hash, file, offset, prio)
	{
		var ti = this._getinfo(hash);
		var url = this._host + "/updateprio/" + hash + "/" + file + "?offset=" + offset + "&prev=" + prio;
		var ret = dorequest(url).then((r) => JSON.parse(r));
		ret.then((r) => {
			var lm = ti.limits[file] || 0;
			if (offset <= lm)
				lm = Math.max(lm, offset + r.max_length);
			ti.limits[file] = lm;
		}).catch(e => console.log(""+e));
		return ret;
	}

	getlimit(hash, file, offset)
	{
		var ti = this._getinfo(hash);
		var lm = ti.limits[file] || 0;
		return Math.max(0, lm - offset);
	}
};

module.exports = TorrentServer;
