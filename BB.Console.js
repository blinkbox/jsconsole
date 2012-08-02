window.console = (function(win){
	var _console = win._console = win.console;
	var userAgent = navigator.userAgent.toLowerCase();
	var isFirefox = /firefox/.test(userAgent);
	var isOpera   = /opera/.test(userAgent);
	var isSafari  = /webkit/.test(userAgent);
	var traceRecursion = 0;
	var countId = "_";
	var counters = {};
	var timeCounters = {};
	var withoutScope = ['dir','dirxml'];
	var toDoList = ['group','groupCollapsed','groupEnd','profile','profileEnd','markTimeline','timeStamp'];
	var logger;
	var loggerStyle = 'background-color: lightgrey; border: 5px solid white; position: absolute; height : 200px; width : 400px; z-index: 1000; margin: 200px 400px; padding: 5px; color: black; font-size: 12px;';
	
	function createUI(){
		if(logger){
			return logger;
		}
		
		logger = win.document.createElement('div');
		logger.id = 'logger';
		logger.innerHTML = "<b><u>UI Logger :</u></b><br>";
		logger.setAttribute('style', loggerStyle + 'display:none;');
		win.document.body.appendChild(logger);
		return logger;
	}
	
	function server(funName, values, stack){
		_console.log(arguments);
	};

	function sendLog(args, funName, value, stack){
		if(_console[funName]){
			if(withoutScope.indexOf(funName) > -1){
				_console[funName](args);
			}else{
				_console[funName].apply(_console, args);
			}
			if(toDoList.indexOf(funName) > -1){
				warn("console."+ funName +"() is not yet supported for remote debugging.");
			}
		}

		server.call(server, funName, value || stringify(args), stack ? stringify(stack) : '');
	};
	
	function getFuncName(f){
		var name;
		if(f){
			if (f.getName instanceof Function){
				return f.getName();
			}
			// in FireFox, Function objects have a name property...
			if (f.name){
				return f.name;
			}
			name = f.toString().match(/function\s*([_$\w\d]*)/)[1];
		}
		return name || "anonymous";
	};
			
	function wasVisited(frames, fn){
		if(frames){
			var i = 0, frame;
			for (; frame = frames[i++]; ){
				if (frame.fn == fn){
					return true;
				}
			}
		}
		return false;
	};
	
    function sortci(a, b) {
        return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
    }

    function stringify(o, simple) {
        var json = '',
            i, ii, 
			type = ({}).toString.call(o),
			pLen = 0,
			nLen = 0,
            parts = [],
            names = [],
			typeList = ['[object String]', '[object Error]', '[object Arguments]', '[object Array]', '[object Object]', '[object Number]', '[object Boolean]', '[object Function]','[object ErrorEvent]'];
		
		if (typeList.indexOf(type) > -1) {
			switch(type){
				case '[object Error]' :
				case '[object ErrorEvent]' :
							o = o.message;
				case '[object String]' :
							json = '"' + o.replace(/\n/g, '\\n').replace(/"/g, '\\"') + '"';
							break;
				case '[object Arguments]' :
							o = Array.prototype.slice.call(o);
				case '[object Array]' :
							json = '[';
							for (i = 0, ii = o.length; i < ii; i++) {
								parts[pLen++] = stringify(o[i], simple);
							}
							json += parts.join(', ') + ']';
							json;
							break;
				case '[object Object]' :
							json = '{ ';
							for (i in o) {
								names[nLen++] = i;
							}
							names.sort(sortci);
							for (i = 0; i < nLen; i++) {
								parts[pLen++] = stringify(names[i]) + ': ' + stringify(o[names[i]], simple);
							}
							if(o.constructor && o.constructor.name){
								parts[pLen++] = stringify('constructor') + ': ' + stringify(o.constructor.name);
							}
							json += parts.join(', ') + '}';
							break;
							
				case '[object Number]' :
							json = o + '';
							break;
				case '[object Boolean]' :
							json = o ? 'true' : 'false';
							break;
				case '[object Function]' :
							json = '"' + getFuncName(o) + '"';
							break;
				default : break;
			};		
        } else if (o === null) {
            json = '"null"';
			
        } else if (o === undefined) {
            json = '"undefined"';
			
        } else if (simple == undefined) {
            json = type + '{\n';
            for (i in o) {
                names[nLen++] = i;
            }
            names.sort(sortci);
            for (i = 0; i < nLen; i++) {
                parts[pLen++] = names[i] + ': ' + stringify(o[names[i]], true); // safety from max stack
            }
            json += parts.join(',\n') + '\n}';
			
        } else {
            try {
                json = o + ''; // should look like an object
            } catch (e) {}
        }
		
        return json;
    }
	
	function toArray(){
		return Array.prototype.slice.call(arguments)
	}



	// ADDITIONAL CONSOLE methods //
	function show(){
		createUI().setAttribute('style', loggerStyle + 'display:block;');
	}
	
	function hide(){
		createUI().setAttribute('style', loggerStyle + 'display:none;');
	}

	function logToUI(){
		createUI().innerHTML += "<li>"+ stringify(arguments) + "</li>";
		show();
	}
	
	function connectTo(callback){
		if(typeof callback === 'function'){
			server = callback;
		}else{
			logToUI("connectTo: callback is not a function.")
		}
	}
	
	function traceStack(err){
		traceRecursion++;
		if (traceRecursion > 1){
			traceRecursion--;
			return;
		}
		
		var frames = [];
		var fn = arguments.callee;
		for (;fn = fn.caller;){
			if (wasVisited(frames, fn)) break;
			var name = getFuncName(fn);
			if(name !== 'eval'){
				frames.push({ name: name, fn : fn });
			}
		}

		if(!err){
			try{
				(0)();
			}catch(e){
				err = e;
			}
		}

		var stack = 
			err.stack || // Firefox / Google Chrome 
			err.stacktrace || // Opera
			"";
			
		// normalize line breaks
		stack = stack.replace(/\n\r|\r\n/g, "\n"); 
		var items = stack.split(/[\n\r]/);
		
		// Google Chrome
		if (isSafari){
			var reChromeStackItem = /^\s+at\s+(.*)((?:http|https|ftp|file):\/\/.*)$/;
			var reChromeStackItemName = /\s*\($/;
			var reChromeStackItemValue = /^(.+)\:(\d+\:\d+)\)?$/;
			var framePos = 0;
			for (var i = 1, length = items.length; i < length; i++, framePos++){
				var frame = frames[framePos];
				var item = items[i];
				var match = item.match(reChromeStackItem);
				if (frame && match){
					var name = match[1];
					if (name){
						name = name.replace(reChromeStackItemName, "");
						frame.name = name; 
					}
					
					var value = match[2].match(reChromeStackItemValue);
					if (value){
						frame.href = value[1];
						frame.lineNo = value[2];
					}
				}                
			}
		}
		else if (isFirefox){
			// Firefox
			var reFirefoxStackItem = /^(.*)@(.*)$/;
			var reFirefoxStackItemValue = /^(.+)\:(\d+)$/;
			var framePos = 0;
			for (var i = 1, length=items.length; i<length; i++, framePos++){
				var frame = frames[framePos] || {};
				var item = items[i];
				var match = item.match(reFirefoxStackItem);
				if (match){
					var name = match[1];
					var value = match[2].match(reFirefoxStackItemValue);
					if (frame && value){
						frame.href = value[1];
						frame.lineNo = value[2];
					}
				}                
			}
		}
		traceRecursion--;
		return frames;
    };
	
	
	// ----- Override CONSOLE methods -----//
	function log() { 
		sendLog(arguments, "log");
	};
	function info() { 
		sendLog(arguments, "info");
	};
	function warn() { 
		sendLog(arguments, "warn");
	};	
	function debug() { 
		sendLog(arguments, "debug");
	};
	function clear() { 
		counters = {};
		timeCounters = {};
		traceRecursion = 0;
		sendLog(arguments, "clear");
	};
	function assert(x) { 
		if (!x){
			var args = ['Assertion failed:'];
			args = args.concat(Array.prototype.slice.call(arguments, 1));
			sendLog(arguments, "assert", stringify(args), traceStack());
        }else{
			sendLog(arguments, "assert");
		}
	};
	function error(e) { 
		sendLog(arguments, 
				"error", 
				null, 
				traceStack(e));
	};
	function exception(e) { 
		sendLog(arguments, 
				"error", 
				null, 
				traceStack(e));
	};
	function trace() { 
		sendLog(arguments, 
				"trace", 
				null, 
				traceStack());
	};
	function count(key) { 
		var frameId = countId + (key || '_GLOBAL__');
		var frameCounter = counters[frameId];
		if (!frameCounter){
			counters[frameId] = frameCounter = { key: key || '', count: 1 };
		}else{
			++frameCounter.count;
		}
		var label = (key || '') +": " + frameCounter.count;
		sendLog(arguments, "count", label);
	};
	function dir(obj) { 
		sendLog(obj, "dir", stringify([obj]));
	};
	function dirxml(node) { 
        if (node instanceof Window)
            node = node.document.documentElement;
        else if (node instanceof Document)
            node = node.documentElement;
			
		var value = node ? node.outerHTML || node.innerHTML || node.toString() || stringify(node) : null;
		sendLog(node, "dirxml", value);
	};
	function time(name, reset) { 
		if (!name)
            return;

        var time = new Date().getTime();
        var key = "KEY"+name.toString();
        if (!reset && timeCounters[key])
            return;

        timeCounters[key] = time;
		sendLog(arguments, "time");
	};
	function timeEnd(name) { 
		var time = new Date().getTime();
        var key = "KEY"+name.toString();
        var timeCounter = timeCounters[key];
        if (timeCounter){
            var diff = time - timeCounter;
            var label = name + ": " + diff + "ms";
            delete timeCounters[key];
			sendLog(arguments, "timeEnd", label);
        }
	};
	
	
	// ----- Override CONSOLE methods TODO -----//
	function group() { 
		sendLog(arguments, "group");
	};
	function groupCollapsed() { 
		sendLog(arguments, "groupCollapsed");
	};
	function groupEnd() { 
		sendLog(arguments, "groupEnd");
	};
	function profile(title) { 
		sendLog(arguments, "profile");
	};
	function profileEnd() { 
		sendLog(arguments, "profileEnd");
	};
	function markTimeline() { 
		sendLog(arguments, "markTimeline");
	};
	function timeStamp(name) { 
		//HTMLScriptElement
		//HTMLLinkElement
		//XMLHttpRequest
		//HTMLIFrameElement
		//HTMLImageElement
		sendLog(arguments, "timeStamp");
	};
	
	if(!JSON){
		win.JSON = {};
	}
	
	if(!win.JSON.stringify){
		win.JSON.stringify = stringify;
	}
	
	return {
		assert: assert,
		count: count,
		debug: debug,
		dir: dir,
		dirxml: dirxml,
		error: error,
		group: group,
		groupCollapsed: groupCollapsed,
		groupEnd: groupEnd,
		info: info,
		log: log,
		markTimeline: markTimeline,
		profile: profile,
		profileEnd: profileEnd,
		time: time,
		timeEnd: timeEnd,
		timeStamp: timeStamp,
		trace: trace,
		exception : exception,
		clear : clear,
		warn: warn,
		
		// ADDITIONAL methods //
		stringify : stringify,
		getStack : traceStack,
		connectTo : connectTo,
		show : show,
		hide : hide,
		logToUI : logToUI
	};
}(window));