;
(function () {

    // Plugins that inject are screwing this up :(
    // function getLastChild(el) {
    //   return (el.lastChild && el.lastChild.nodeName != '#text') ? getLastChild(el.lastChild) : el;
    // }
	try{
		function getRemoteScript() {
			var scripts = document.getElementsByTagName('script'),
				remoteScript = scripts[scripts.length - 1];
			for (var i = 0; i < scripts.length; i++) {
				if (/jsconsole\..*(:\d+)?\/remote.js/.test(scripts[i].src)) {
					remoteScript = scripts[i];
					break;
				}
			}

			return remoteScript;
		}

		var last = getRemoteScript();

		// if (last.getAttribute('id') == '_firebugConsole') { // if Firebug is open, this all goes to crap
		//   last = last.previousElementSibling;
		// } 

		var lastSrc = last.getAttribute('src'),
			id = lastSrc.replace(/.*\?/, ''),
			origin = 'http://' + lastSrc.substr(7).replace(/\/.*$/, ''),
			remoteWindow = null,
			queue = [],
			msgType = '';

		var remoteFrame = document.createElement('iframe');
		remoteFrame.style.display = 'none';
		remoteFrame.src = origin + '/remote.html?' + id;

		remoteFrame.onload = function () {
			try{
				remoteWindow = remoteFrame.contentWindow;
				remoteWindow.postMessage('__init__', origin);
				remoteWindow.postMessage(console.stringify({
					response: 'Connection established with ' + window.location.toString() + '\n' + navigator.userAgent,
					type: 'info'
				}), origin);

				for (var i = 0, ii = queue.length; i < ii; i++) {
					remoteWindow.postMessage(queue[i], origin);
				}
			}catch(e){
				console.logToUI(e);
			}
		};	
		
		// this is new - in an attempt to allow this code to be included in the head element
		document.documentElement.appendChild(remoteFrame);

		
		function sendToServer(funName, values, stack){
			try{
				var msg = JSON.stringify({
						response: values,
						cmd: 'console.'+funName+'()',
						type : funName,
						stack : stack
					});
				if (remoteWindow) {
					remoteWindow.postMessage(msg, origin);
				} else {
					queue.push(msg);
				}
			}catch(e){
				console.logToUI(e);
			}			
		};

		function fallback (){
			document.writeln(Array.prototype.slice.call(arguments));
		}
		function reportError(){
			console.error(arguments, 'GLOBAL');
			return true;
		}
		//init
		console.logToUI = console.logToUI || fallback;
		console.profiler = console.profiler || fallback;
		console.profilerOut = console.profilerOut || fallback;
		console.warn = console.warn || fallback;
		console.error = console.error || fallback;
		console.getStack = console.getStack || fallback;
		console.connectTo = console.connectTo || fallback;
		console.connectTo(sendToServer);
		
		window.onerror = reportError;
		
		if(window.addEventListener){
			window.addEventListener('message', function (event) {
				if (event.origin != origin) return;
				// eval the event.data command
				try {
					if (event.data.indexOf('console.log') === 0) {
						eval('remote.echo(' + event.data.match(/console.log\((.*)\);?/)[1] + ', "' + event.data + '", true)');
					} else {
						remote.echo(eval(event.data), event.data, undefined); // must be undefined to work
					}
				} catch (e) {
					console.error(e, event.data);
				}
			}, false);
			
			window.addEventListener('error', reportError, false);
		}

		
		var remote = {
			echo: function () {
				try{
					var args = [].slice.call(arguments, 0),
						plain = args.pop(),
						cmd = args.pop(),
						response = args;

					var argsObj = console.stringify(response, plain),
						msg = JSON.stringify({
							response: argsObj,
							cmd: cmd
						});
					if (remoteWindow) {
						remoteWindow.postMessage(msg, origin);
					} else {
						queue.push(msg);
					}
				}catch(e){
					console.logToUI(e);
				}				
			}
		};
		
		window.remote = remote;

		function warnUsage() {
			var useSS = false;
			try {
				sessionStorage.getItem('foo');
				useSS = true;
			} catch (e) {}
			
			if (!(useSS ? sessionStorage.jsconsole : window.name)) {
				if (useSS) sessionStorage.jsconsole = 1;
				else window.name = 1;
			}
		}
	}catch(e){
		console.logToUI(e);
	}
    //warnUsage();
})();