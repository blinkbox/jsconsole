/*globals navigator,window,console */
window.console = window.console || {};
window.JSON = window.JSON || {};

(function () {
    var nativeConsole = window.nativeConsole = window.console,
        userAgent = navigator.userAgent.toLowerCase(),
        isFirefox = /firefox/.test(userAgent),
        isOpera = /opera/.test(userAgent),
        isWebkit = /webkit/.test(userAgent),
        traceRecursion = 0,
        countId = "_",
        counters = {},
        timeCounters = {},
        withoutScope = ['dir', 'dirxml'],
        toDoList = ['group', 'groupCollapsed', 'groupEnd', 'markTimeline', 'timeStamp'],
        logger,
        loggerStyle = 'background-color: lightgrey; border: 5px solid white; position: absolute; height : 200px; width : 400px; z-index: 1000; margin: 200px 400px; padding: 5px; color: black; font-size: 12px;',
        isConsoleProfileSupported = false,
        profilesTitle = [],
        activeProfiles = [],
        profiles = [],
        profileId = 0,
        nodeDepth = 0,
        isProfilerEnabled = false;

    try
    {
        if (typeof nativeConsole.profiles === 'object')
        {
            nativeConsole.profile('enableCheck');
            nativeConsole.profileEnd();
            isConsoleProfileSupported = nativeConsole.profiles.length > 0;
        }
    } catch (e) { }

    function createUI()
    {
        if (logger)
        {
            return logger;
        }
        logger = window.document.createElement('div');
        logger.id = 'logger';
        logger.innerHTML = "<b><u>UI Logger :</u></b><br>";
        logger.setAttribute('style', loggerStyle + 'display:none;');
        window.document.body.appendChild(logger);
        return logger;
    }

    function server(funName, values, stack)
    {
        nativeConsole.log(funName, values, stack);
    }

    function sortci(a, b)
    {
        return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
    }

    function getFuncName(f)
    {
        var name;
        if (f)
        {
            // in FireFox, Function objects have a name property...
            name = (f.getName instanceof Function) ? f.getName() : f.name || f.toString().match(/function\s*([_$\w\d]*)/)[1];
        }
        return name || "anonymous";
    }

    /*ignore jslint start*/
    function stringify(o, simple)
    {
        var json = '',
            i,
            ii,
            type = ({}).toString.call(o),
            pLen = 0,
            nLen = 0,
            parts = [],
            names = [],
            typeList = ['[object String]', '[object Error]', '[object Arguments]', '[object Array]', '[object Object]', '[object Number]', '[object Boolean]', '[object Function]', '[object ErrorEvent]', '[object ScriptProfileNode]', '[object ScriptProfile]', 'object'];

        if (typeList.indexOf(type) === -1)
        {
            type = typeof (type);
        }

        if (typeList.indexOf(type) > -1)
        {
            switch (type)
            {
                case '[object Error]':
                case '[object ErrorEvent]':
                    o = o.message;
                case '[object String]':
                    json = '"' + o.replace(/\n/g, '\\n').replace(/"/g, '\\"').replace(/</g, '').replace(/>/g, '') + '"';
                    break;
                case '[object Arguments]':
                    o = Array.prototype.slice.call(o);
                case '[object Array]':
                    json = '[';
                    for (i = 0, ii = o.length; i < ii; i++)
                    {
                        parts[pLen++] = stringify(o[i], simple);
                    }
                    json += parts.join(', ') + ']';
                    break;
                case 'object':
                case '[object ScriptProfile]':
                case '[object ScriptProfileNode]':
                case '[object Object]':
                    json = '{ ';
                    for (i in o)
                    {
                        names[nLen++] = i;
                    }
                    names.sort(sortci);
                    for (i = 0; i < nLen; i++)
                    {
                        parts[pLen++] = stringify(names[i]) + ': ' + stringify(o[names[i]], simple);
                    }
                    if (o.constructor && o.constructor.name)
                    {
                        parts[pLen++] = stringify('constructor') + ': ' + stringify(o.constructor.name);
                    }
                    if (type === '[object ScriptProfileNode]')
                    {
                        parts[pLen++] = stringify('children') + ': ' + stringify(o.children());
                    }

                    json += parts.join(', ') + '}';
                    break;

                case '[object Number]':
                    json = String(o);
                    break;
                case '[object Boolean]':
                    json = o ? 'true' : 'false';
                    break;
                case '[object Function]':
                    json = '"' + getFuncName(o) + '"';
                    break;
                default:
                    break;
            }
        } else if (o === null)
        {
            json = '"null"';

        } else if (o === undefined)
        {
            json = '"undefined"';

        } else if (simple === undefined)
        {
            json = type + '{\n';
            for (i in o)
            {
                names[nLen++] = i;
            }
            names.sort(sortci);
            for (i = 0; i < nLen; i++)
            {
                // safety from max stack
                parts[pLen++] = names[i] + ': ' + stringify(o[names[i]], true);
            }
            json += parts.join(',\n') + '\n}';

        } else
        {
            try
            {
                // should look like an object
                json = String(o);
            } catch (e) { }
        }

        return json;
    }
    /*ignore jslint end*/

    function sendLog(args, funName, value, stack)
    {
        if (nativeConsole[funName])
        {
            if (withoutScope.indexOf(funName) > -1)
            {
                nativeConsole[funName](args);
            } else
            {
                nativeConsole[funName].apply(nativeConsole, args);
            }
            if (toDoList.indexOf(funName) > -1)
            {
                warn("console." + funName + "() is not yet supported for remote debugging.");
            }
        }

        server.call(server, funName, value || stringify(args), stack ? stringify(stack) : '');
    }

    /*ignore jslint start*/
    function wasVisited(frames, fn)
    {
        if (frames)
        {
            var i = 0,
                frame;
            for (;(frame = frames[i++]);)
            {
                if (frame.fn == fn)
                {
                    return true;
                }
            }
        }
        return false;
    }
    /*ignore jslint end*/

    function updateChromeStackFrames(frames, items)
    {
		//e.g 
		// Error: unknow error
		// at functionName1 (http://yourwebsite/test.js:1000:10)
		// at functionName2 (http://yourwebsite/test.js:2000:10)
        var reChromeStackItem = /^\s+at\s+(.*)((?:http|https|ftp|file):\/\/.*)$/,
            reChromeStackItemName = /\s*\($/,
            reChromeStackItemValue = /^(.+)\:(\d+\:\d+)\)?$/,
            framePos = 0,
            i = 1,
            length = items.length;

        for (;i < length; i++, framePos++)
        {
            var frame = frames[framePos],
                item = items[i],
                match = item.match(reChromeStackItem);

            if (frame && match)
            {
                var name = match[1],
                    value = match[2].match(reChromeStackItemValue);

                if (name)
                {
                    name = name.replace(reChromeStackItemName, "");
                    frame.name = name;
                }
                
                if (value)
                {
                    frame.href = value[1];
                    frame.lineNo = value[2];
                }
            }
        }

        return frames;
    }

    function updateFireFoxStackFrames(frames, stack)
    {
		// Error: unknow error
		// functionName1((void 0), function(){},[Object object])@http://yourwebsite/test.js:1000
		// ((void 0), function{
		//  ---------------------function body--------------------
		// },[Object object])@http://yourwebsite/test.js:2000
		// ()@http://yourwebsite/test.js:200
		
		stack = stack.replace(/\n\n|\r\r/img, "");
		var stackItems = stack.split(/[\n\r]/),
			reFirefoxStackItem = /^(.*)@(.*)$/,
            reFirefoxStackItemValue = /^(.+)\:(\d+)$/,
			idx = 0,
			i = 0,
			length = 0,
			items = [],
            framePos = 1,
			ii = stackItems.length;
			
		for(; i < ii; i++)
		{
			var item = stackItems[i],
				value = item || '';
				
			if(value.indexOf('@http') > -1){
				if(idx){
					items[idx] += value;
				}else{
					items[length++] = value;
				}
				idx = 0;
			}else{
				if(idx){
					items[idx] += value;
				}else{
					idx = length;
					items[length++] = value;
				}
			}
		}

        for (i = 0;i < length; i++, framePos++)
        {
            var frame = frames[framePos],
                item = items[i],
                match = item.match(reFirefoxStackItem);

            if (frame && match)
            {
                var name = match[1],
                    value = match[2].match(reFirefoxStackItemValue);

                if (frame && value)
                {
                    frame.href = value[1];
                    frame.lineNo = value[2];
                }
            }
        }

        return frames;
    }

    function updateOperaStackFrames(frames, items)
    {
		//e.g 
		// Error: unknow error
		// functionName1([arguments not available])@http://yourwebsite/test.js:1000
		// functionName2([arguments not available])@http://yourwebsite/test.js:2000
		//
		// Error created at functionName1([arguments not available])@http://yourwebsite/test.js:1000
		// functionName2([arguments not available])@http://yourwebsite/test.js:2000
        var reOperaStackItem = /^(.*)@(.*)$/,
            reOperaStackItemValue = /^(.+)\:(\d+)$/,
            framePos = 2,
            i = 0,
            length = items.length >> 1;

        for (;i < length; i++, framePos++)
        {
            var frame = frames[framePos],
                item = items[i],
                match = item.match(reOperaStackItem);

            if (frame && match)
            {
                var name = match[1],
                    value = match[2].match(reOperaStackItemValue);

                if (frame && value)
                {
                    frame.href = value[1];
                    frame.lineNo = value[2];
                }
            }
        }

        return frames;
    }

    function getProfile(title)
    {
        var i = 0,
            item;
        for (;(item = activeProfiles[i++]);)
        {
            if (item.title === title)
            {
                return item;
            }
        }
        return null;
    }

    function getChildNode(list, depth, currentDepth)
    {
        currentDepth = currentDepth || 1;
        return (currentDepth < depth) ? getChildNode(list.children[list.children.length - 1], depth, ++currentDepth) : list;
    }

    function getProfileNode(list, funName, file, line)
    {
        var i = 0,
            item;
        for (;(item = list[i++]);)
        {
            if (item.functionName === funName && item.url === file && item.lineNumber === line)
            {

                return item;
            }
        }
        return null;
    }

    function ScriptProfile(title, uid)
    {
        this.head = new ScriptProfileNode("(root)", "", 0);
        this.title = title;
        this.uid = uid;
        this.active = true;
    };

    function ScriptProfileNode(functionName, file, line)
    {
        this.functionName = functionName;
        this.lineNumber = line;
        this.url = file;
        this.callUID = 10001;
        this.numberOfCalls = 0;
        this._startTime = +(new Date());
        this._endTime = 0;
        this.selfTime = 0;
        this.totalTime = 0;
        this.visible = true;
        this.children = [];
    };

    // ADDITIONAL CONSOLE methods //
    function show()
    {
        createUI().setAttribute('style', loggerStyle + 'display:block;');
    }

    function hide()
    {
        createUI().setAttribute('style', loggerStyle + 'display:none;');
    }

    function logToUI()
    {
        createUI().innerHTML += "<li>" + stringify(arguments) + "</li>";
        show();
    }

    function connectTo(callback)
    {
        if (typeof callback === 'function')
        {
            server = callback;
        } else
        {
            logToUI("connectTo: callback is not a function.")
        }
    }

    function traceStack(err)
    {
        traceRecursion++;
        if (traceRecursion > 1)
        {
            traceRecursion--;
            return;
        }

        var frames = [],
            fn = arguments.callee;

        for (;(fn = fn.caller);)
        {
            if (wasVisited(frames, fn)) break;

            var name = getFuncName(fn);
            if (name !== 'eval')
            {
                frames.push({
                    name: name,
                    fn: fn
                });
            }
        }

        if (!err)
        {
            try
            {
                (0)();
            } catch (e)
            {
                err = e;
            }
        }

        var items,
            stack = err.stack || // Firefox / Google Chrome
                    err.stacktrace || // Opera
                    "";
        // normalize line breaks
        stack = stack.replace(/\n\r|\r\n/g, "\n");
        items = (isWebkit || isOpera) ? stack.split(/[\n\r]/) : [];
		
        if (isWebkit)
        {
            frames = updateChromeStackFrames(frames, items);
        } else if (isFirefox)
        {
            frames = updateFireFoxStackFrames(frames, stack);
        } else if (isOpera)
        {
            frames = updateOperaStackFrames(frames, items);
        }

        traceRecursion--;
        return frames;
    };

    function profilerOut()
    {
        if (!isConsoleProfileSupported && isProfilerEnabled)
        {
            if (nodeDepth)
            {
                var i = 0,
                    item,
                    endTime = +(new Date());
                for (;(item = activeProfiles[i++]);)
                {
                    updateScriptNode(getChildNode(item.head, nodeDepth + 1), endTime);
                }
                --nodeDepth;
            }
        }
    }

    function updateScriptNode(node, endTime)
    {
        if (node)
        {
            node._endTime = endTime;
            node.totalTime = (node._endTime - node._startTime);
        }
    }

    function profiler(functionName, file, line)
    {
        if (!isConsoleProfileSupported && isProfilerEnabled)
        {
            ++nodeDepth;
            var profileNode = new ScriptProfileNode(functionName, file, line),
                i = 0,
                item;
            for (;(item = activeProfiles[i++]);)
            {
                var node = getChildNode(item.head, nodeDepth);
                if (node)
                {
                    var pNode = getProfileNode(node.children, functionName, file, line);
                    if (pNode)
                    {
                        ++pNode.numberOfCalls;
                    } else
                    {
                        node.children.push(profileNode);
                    }
                }
            }
        }
    }

    // ----- Override CONSOLE methods -----//
    function log()
    {
        sendLog(arguments, "log");
    };

    function info()
    {
        sendLog(arguments, "info");
    };

    function warn()
    {
        sendLog(arguments, "warn");
    };

    function debug()
    {
        sendLog(arguments, "debug");
    };

    function clear()
    {
        counters = {};
        timeCounters = {};
        traceRecursion = 0;
        sendLog(arguments, "clear");
    };

    function assert(x)
    {
        if (!x)
        {
            var args = ['Assertion failed:'];
            args = args.concat(Array.prototype.slice.call(arguments, 1));
            sendLog(arguments, "assert", stringify(args), traceStack());
        } else
        {
            sendLog(arguments, "assert");
        }
    };

    function error(e)
    {
        sendLog(arguments, "error",
        null,
        traceStack(e));
    };

    function exception(e)
    {
        sendLog(arguments, "error",
        null,
        traceStack(e));
    };

    function trace()
    {
        sendLog(arguments, "trace",
        null,
        traceStack());
    };

    function count(key)
    {
        var frameId = countId + (key || '_GLOBAL__'),
            frameCounter = counters[frameId];

        if (!frameCounter)
        {
            counters[frameId] = frameCounter = {
                key: key || '',
                count: 1
            };
        } else
        {
            ++frameCounter.count;
        }
        
        sendLog(arguments, "count", (key || '') + ": " + frameCounter.count);
    };

    function dir(obj)
    {
        sendLog(obj, "dir", stringify([obj]));
    };

    function dirxml(node)
    {
        if (node instanceof Window) node = node.document.documentElement;
        else if (node instanceof Document) node = node.documentElement;

        var value = node ? node.outerHTML || node.innerHTML || node.toString() || stringify(node) : null;
        sendLog(node, "dirxml", value);
    };

    function time(name, reset)
    {
        if (!name) return;

        var time = new Date().getTime(),
            key = "KEY" + name.toString();

        if (!reset && timeCounters[key]) return;

        timeCounters[key] = time;
        sendLog(arguments, "time");
    };

    function timeEnd(name)
    {
        var time = new Date().getTime(),
            key = "KEY" + name.toString(),
            timeCounter = timeCounters[key];

        if (timeCounter)
        {
            var diff = time - timeCounter;
            delete timeCounters[key];
            sendLog(arguments, "timeEnd", name + ": " + diff + "ms");
        }
    };

    function profile(title)
    {
        title = title || 'Profile ' + (++profileId);

        if (profilesTitle.indexOf(title) === -1)
        {
            profilesTitle.push(title);
            if (!isConsoleProfileSupported)
            {
                activeProfiles.push(new ScriptProfile(title, profileId));
                isProfilerEnabled = true;
            };
            sendLog([title], "profile", 'Profile "' + title + '" started.');
        } else
        {
            warn(title + " profile already active.");
        }
    };

    function profileEnd(title)
    {
        if (!title)
        {
            title = profilesTitle[profilesTitle.length - 1];
        }
        var index = profilesTitle.indexOf(title);
        if (index > -1)
        {
            if (!isConsoleProfileSupported)
            {
                var profile = getProfile(title);
                if (profile)
                {
                    delete profile.active;
                    var head = profile.head;
                    if (!head.totalTime)
                    {
                        if (head.children.length > 0)
                        {
                            var min = 0,
                                max = 0,
                                i = 0,
                                item;
                            for (;(item = head.children[i++]);)
                            {
                                if (!min)
                                {
                                    min = item._startTime;
                                };

                                min = Math.min(min, item._startTime);
                                max = Math.max(max, item._endTime);
                            }
                            head.totalTime = (max - min);
                            head._startTime = min;
                            head._endTime = max;
                        } else
                        {
                            head.totalTime = (+(new Date()) - head._startTime);
                        }
                    }
                    profiles.push(profile);
                };
            };
            profilesTitle.splice(index, 1);
            isProfilerEnabled = profilesTitle.length > 0;
            sendLog([title], "profileEnd", 'Profile "' + title + '" finished.');
        } else
        {
            warn(title + " profile doesn't exist.");
        }
    };

    // ----- Override CONSOLE methods TODO -----//
    function group()
    {
        sendLog(arguments, "group");
    };

    function groupCollapsed()
    {
        sendLog(arguments, "groupCollapsed");
    };

    function groupEnd()
    {
        sendLog(arguments, "groupEnd");
    };

    function markTimeline()
    {
        sendLog(arguments, "markTimeline");
    };

    function timeStamp(name)
    {
        sendLog(arguments, "timeStamp");
    };

    var consoleObj = {
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
        exception: exception,
        clear: clear,
        warn: warn,
        profiles : isConsoleProfileSupported ? nativeConsole.profiles : profiles,

        profiler: profiler,
        profilerOut: profilerOut,
        stringify: stringify,
        getStack: traceStack,
        connectTo: connectTo,
        show: show,
        hide: hide,
        logToUI: logToUI
    };

    if (!window.JSON.stringify)
    {
        window.JSON.stringify = stringify;
    }

	// just in case its readOnly
	try{
		window.BBConsole = window.console = consoleObj;
	}catch(e){}

} ());