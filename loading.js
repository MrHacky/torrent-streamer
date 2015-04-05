
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