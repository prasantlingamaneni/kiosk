$(function(){

  var RESTART_DELAY = 1000;
  var CHECK_SCHEDULE_DELAY = 30 * 1000; //check content against schedule every 30 seconds
  var DEFAULT_SCHEDULE_POLL_INTERVAL = 15; //minutes
  var DEFAULT_ROTATE_RATE = 30; //seconds
  var ACTIVE_EVENTS = "click mousedown mouseup mousemove touch touchstart touchend keypress keydown";

  var restarting = false;
  var reset = false;
  var win = window;
  var activeTimeout;
  var restart;
  var urlrotateindex = 0;
  var rotaterate;
  var schedule,scheduleURL,contentURL,defaultURL,currentURL,updateScheduleTimeout,checkScheduleTimeout,schedulepollinterval;
  var hidecursor = false;
  var disablecontextmenu = false;
  var disabledrag = false;
  var disabletouchhighlight = false;
  var disableselection = false;
  var useragent = '';
  var resetcache = false;
  var partition = null;
  var deviceid;
  var lastupdatedcontenttime = null;
  var restartInterval;
  var schedulePollIntervalTime;

  $('.modal').not('#newWindow').modal();
  $('#newWindow').modal({
     complete: function() {
        $('#newWindow webview').remove();
     }
  });

  //prevent existing fullscreen on escape key press
  window.onkeydown = window.onkeyup = function(e) { console.log("entered key:"+e.keyCode); if (e.keyCode == 27) { e.preventDefault(); } };

  function rotateURL(){
    if(contentURL.length > 1){
      if (urlrotateindex < (contentURL.length-1)){
        urlrotateindex++;
      } else {
        urlrotateindex = 0;
      }
      currentURL = contentURL[urlrotateindex];
      $("#browser").remove();
      loadContent();
    }
  }

  function updateSchedule(){
	var pollUrl =  scheduleURL.indexOf('?') >= 0 ? scheduleURL+'&deviceid='+deviceid+'&kiosk_t='+Date.now() : scheduleURL+'?deviceid='+deviceid+'&kiosk_t='+Date.now();
	console.log("pollUrl: "+pollUrl);
	$.ajax(pollUrl,{
	      success: function(s) {
	    	  console.log("s json:"+s);
				if(s!=null) {
			    	console.log("s json stringify:"+JSON.stringify(s));
			        var uploadtime = s.uploadtime;
			        var url = s.url;
			        var content_script = s.content_script;
			        var decoded_content_script = atob(content_script);
			        console.log("decode_content_script:"+decoded_content_script)
			        var isdisplayid = s.isdisplayid;
			        var restartVal = s.restart;
			        var pollIntervalVal = s.remotepollinterval;

			        if((lastupdatedcontenttime == null || uploadtime > lastupdatedcontenttime)) {
			        	console.log("inside if of new content")
			        	storeNewContent(s);
			        	lastupdatedcontenttime = uploadtime
			        	currentURL = url;
			        	setRestartInterval(restartVal);
			        	setSchedulePollInterval(pollIntervalVal);
				        loadContent(); 
				    	displayIdInWebview(isdisplayid);
				    	executeScriptInWebview(decoded_content_script, true);
				    }
			      } else {
			    	  loadContent();
			    	  displayIdInWebview(true);
			      }
	       },
	       error: function() {
	    	   loadContent();
			   displayIdInWebview(true);
	       }
		});

  }

  function checkSchedule(){
    var s = schedule;
    var scheduledContent = [];
    if(s && s.length){
      var now = Date.now();
      var hasScheduledContent = false;
      for(var i = 0; i < s.length; i++){
        if(now >= s[i].start && now < s[i].end){
          scheduledContent.push(s[i]);
      }
    }

    if(scheduledContent.length){
       //find the latest start time
       scheduledContent.sort(function(a,b){
         if(a.start == b.start ) return a;
         return b.start - a.start;
       });

       //first in the list has the latest start time
       //only on a change do we want to load
       if(scheduledContent[0].content && !hasURL(scheduledContent[0].content)){
          currentURL = scheduledContent[0].content.length ? scheduledContent[0].content : [scheduledContent[0].content];
          loadContent();
       }
    }
    else if(currentURL != defaultURL){
        currentURL = defaultURL;
        loadContent();
    }
   }
 }
  
  function executeScriptInWebview(executescriptVal, isexecutescript) {
	  
	  /* execute script after loading webview */
		var wv = document.querySelector('webview');
		wv.addEventListener('loadcommit', function() {
			console.log("start webview")

			var codeVal = executescriptVal;
			if (isexecutescript) {
				console.log("executing script:"+codeVal);
				wv.executeScript(
						{code: codeVal},
						function(results) {
							console.log(results[0]);
						}
				);
			}
			
		});
		console.log("end webview")
		/* end */
  }
  
  function displayIdInWebview(isdisplayId) {
	  
		console.log("displayId:"+isdisplayId);
		console.log("data.uniqId:"+deviceid);
		var wv = document.querySelector('webview');
		wv.addEventListener('loadcommit', function() {
			if (isdisplayId) {
				var divVal = "script = document.createElement('script');"
				+ " script.text=\" var n = document.createElement('div');"
				+ "  n.id = 'my-id';"
				+ "  n.style.display = 'block';"
				+ "  n.align = 'center';"
				+ "  n.innerHTML = '"+deviceid+"';"
				+ "  document.body.appendChild(n)\";"
				+ "  document.head.appendChild(script);"
				+ "  document.getElementById('my-id').innerHTML"
				wv.executeScript(
					{code: divVal},
					function(results) {
						console.log(results[0]);
					}
				);
				
				wv.insertCSS({
					code: '#my-id { position: fixed;bottom: 0;left: 0;z-index: 999;width: 100%;height: 23px; font-weight: bold; color:orange; font-size: 20px}',
					runAt: 'document_end'
				});
			}
		});
  }
  
  function storeNewContent(s) {
	  
	  var actual_JSON = s;
	  
	  var url = actual_JSON.url;
	    if(url){
	      errUrl = validateURL(url);
	      if(errUrl){
	    	  isValid=false;
	      }
	    }
	    chrome.storage.local.set({'url':url});
	    
	    var rotateVal = actual_JSON.rotate;
	    var isrotateval = true;
	    var arrRotate =[0,90,180,270];
	    if (!arrRotate.includes(rotateVal)) {
	    	isValid=false;
	    	isrotateval = false
	    }
	    if(isrotateval) {
	    	chrome.storage.local.set({'rotateval':rotateVal});
	    	chrome.system.display.getInfo(function(d){
		    	chrome.system.display.setDisplayProperties(d[0].id,{'rotation':rotateVal}, function() {
		    	});
	    	});
	    }
	    else chrome.storage.local.remove('rotateval');
	     
	    schedulepollinterval = actual_JSON.remotepollinterval;
	    if(schedulepollinterval > 0 ){
		    chrome.storage.local.set({'schedulepollinterval':schedulepollinterval});
	    }
	    
	    hidecursor = actual_JSON.hidecursor;
	    if(hidecursor) chrome.storage.local.set({'hidecursor':hidecursor});
	    else chrome.storage.local.remove('hidecursor');
	    
	    disablecontextmenu = actual_JSON.disablecontextmenu;
	    if(disablecontextmenu) chrome.storage.local.set({'disablecontextmenu':disablecontextmenu});
	    else chrome.storage.local.remove('disablecontextmenu');
	    
	    disabledrag = actual_JSON.disabledrag;
	    if(disabledrag) chrome.storage.local.set({'disabledrag':disabledrag});
	    else chrome.storage.local.remove('disabledrag');
	    
	    disabletouchhighlight = actual_JSON.disabletouchhighlight;
	    if(disabletouchhighlight) chrome.storage.local.set({'disabletouchhighlight':disabletouchhighlight});
	    else chrome.storage.local.remove('disabletouchhighlight');
	    
	    disableselection = actual_JSON.disableselection;
	    if(disableselection) chrome.storage.local.set({'disableselection':disableselection});
	    else chrome.storage.local.remove('disableselection');
	    
	    allownewwindow = actual_JSON.newwindow;
	    if(allownewwindow) chrome.storage.local.set({'newwindow':newwindow});
	    else chrome.storage.local.remove('newwindow');
	    
	    useragent = actual_JSON.useragent;
	    if(useragent) chrome.storage.local.set({'useragent':useragent});
	    else chrome.storage.local.remove('useragent');
	    
	    reset = actual_JSON.reset;
	    if(reset && reset > 0) {
	    	chrome.storage.local.set({'reset':reset});
	    } else {
	    	chrome.storage.local.remove('reset');
	    }
	    
	    var sleepmode = actual_JSON.sleepmode;
	    var arrDisplay =['display','system','none'];
	    if (sleepmode && arrDisplay.includes(sleepmode)) {
	    	chrome.storage.local.set({'sleepmode':sleepmode});
	    } else {
	    	sleepmode="display";
	    	chrome.storage.local.set({'sleepmode':sleepmode});
	    }
	    
	    resetcache = actual_JSON.resetcache;
	    if(resetcache) chrome.storage.local.set({'resetcache': resetcache});
	    else chrome.storage.local.remove('resetcache');
	    
  }
  
  function setRestartInterval(restartVal) {
	  
	  	var isrestart = false;
	    if(restartVal && (restartVal >= 0 && restartVal < 24)){
	    	chrome.storage.local.set({'restart':restartVal});
	    	isrestart = true;
	    } else {
	    	chrome.storage.local.remove('restart');
	    }
	    
	    if(isrestart) {
          var hour = parseInt(restartVal) - 1;
          var now = moment();
          restart = moment();
          restart.hour(hour).set({'minute':0, 'second':0, 'millisecond':0});
          if(now.isAfter(restart)) restart.add(1,'d'); //if we're past the time today, do it tomorrow
          if(restartInterval) clearInterval(restartInterval);
          restartInterval = setInterval(function(){
             var now = moment();
             if(now.isAfter(restart)) {
               chrome.runtime.restart(); //for ChromeOS devices in "kiosk" mode
               chrome.runtime.sendMessage('reload'); //all other systems
             }
           },60*1000);
	    }
	  
  }
  
  function setSchedulePollInterval(schedulepollinterval) {
	  if(schedulePollIntervalTime) clearInterval(schedulePollIntervalTime);
	  schedulePollIntervalTime = setInterval(updateSchedule,schedulepollinterval * 60 * 1000);
  }
  
  
  function validateURL(url){
	    return url.indexOf("http://") >= 0 || url.indexOf("https://") >= 0 ? null : 'Invalid content URL';
  }

  chrome.storage.local.get(null,function(data){
	  
	 if(data.hardwareid){
		 deviceid = data.hardwareid;
	 }
	 console.log("data.local:"+data.local);
     if(data.local){
       console.log("setting of admin keys")
       $(document).keydown(function(e) {
         if(e.ctrlKey && e.which == 65){
           chrome.runtime.getBackgroundPage(function(backgroundPage) {
             backgroundPage.stopAutoRestart();
             $('#login').modal('open');
             $('#username').focus();
          });
         }
       });

       function submitLoginForm(e) {
         e.preventDefault();
         var username = $('#username').val();
         var password = $("#password").val();
         if(username == data.username && password == data.password){
           $('#login').modal('close');
           $('#username').val('');
           $("#password").val('');
           openWindow("windows/setup.html");
        }else{
          Materialize.toast('Invalid login.', 4000);
        }
       }

       // UX: Pressing enter within the username field will focus the password field
       $('#username').on('keydown', function(e) {
         if(e.which == 13 || e.key == 'Enter') {
           $('#password').focus();
         }
       });

       // UX: Pressing enter within the password field will submit the login form
       $('#password').on('keydown', function(e) {
         if(e.which == 13 || e.key == 'Enter') {
           submitLoginForm(e);
         }
       });

       $('#submit').on('click', submitLoginForm);
     }

     if(data.restart && parseInt(data.restart)){
       var hour = parseInt(data.restart) - 1;
       var now = moment();
       restart = moment();
       restart.hour(hour).set({'minute':0, 'second':0, 'millisecond':0});
       if(now.isAfter(restart)) restart.add(1,'d'); //if we're past the time today, do it tomorrow
       restartInterval = setInterval(function(){
          var now = moment();
          if(now.isAfter(restart)) {
            chrome.runtime.restart(); //for ChromeOS devices in "kiosk" mode
            chrome.runtime.sendMessage('reload'); //all other systems
          }
        },60*1000);
     }

     hidecursor = data.hidecursor ? true : false;
     disablecontextmenu = data.disablecontextmenu ? true : false;
     disabledrag = data.disabledrag ? true : false;
     disabletouchhighlight = data.disabletouchhighlight ? true : false;
     disableselection = data.disableselection ? true : false;
     resetcache = data.resetcache ? true : false;
     partition = data.partition;
     allownewwindow = data.newwindow ? true : false

     reset = data.reset && parseFloat(data.reset) > 0 ? parseFloat(data.reset) : false;

     if(reset) $('*').on(ACTIVE_EVENTS,active);

     defaultURL = contentURL = Array.isArray(data.url) ? data.url : [data.url];
     useragent = data.useragent;
     if(data.multipleurlmode == 'rotate'){
        defaultURL = contentURL[urlrotateindex];
        rotaterate = data.rotaterate ? data.rotaterate : DEFAULT_ROTATE_RATE;
        setInterval(rotateURL,rotaterate * 1000);
     }
     currentURL = defaultURL;
     
     if(data.remoteschedule && data.remotescheduleurl){
         schedulepollinterval = data.schedulepollinterval ? data.schedulepollinterval : DEFAULT_SCHEDULE_POLL_INTERVAL;
         scheduleURL = data.remotescheduleurl;
         updateSchedule();
         //var schedulePollIntervalTime = setInterval(updateSchedule,schedulepollinterval * 60 * 1000);
         //setInterval(checkSchedule,CHECK_SCHEDULE_DELAY);
     } else {
    	 loadContent();
    	 displayIdInWebview(true);
     }

  });

  window.addEventListener('message', function(e){
    var data = e.data;
    if(data.title && data.id){
      $('#tabs .tab.'+data.id+' a').text(data.title);
    }
  });

  chrome.runtime.onMessage.addListener(function(data){
    if(data.url){
      var url = data.url.split(',');
      if(!hasURL(url)){
        contentURL = currentURL = url;
        loadContent();
      }
    }
  });

  function hasURL(url){
    if(Array.isArray(url)){
      for(var i = 0; i < url.length; i++){
        if(!currentURL.includes(url[i])){
          return false;
        }
      }
      return true;
    }
    return currentURL.includes(url);
  }

  function active(){
    if(reset){
      if(activeTimeout) clearTimeout(activeTimeout);
      activeTimeout = setTimeout(function(){
        loadContent();
      },reset*60*1000);
    }
  }

  function initWebview($webview){
     $webview.css({
       width:'100%',
       height:'100%',
       position:'absolute',
       top:0,
       left:0,
       right:0,
       bottom:0
     })
     .attr('partition',partition)
     .on('exit',onEnded)
     .on('unresponsive',onEnded)
     .on('loadabort',function(e){if(e.isTopLevel) onEnded(e); })
     .on('consolemessage',function(e){
       if(e.originalEvent.message == 'kiosk:active') active();
     })
     .on('permissionrequest',function(e){
       if(e.originalEvent.permission === 'media') {
         e.preventDefault();
         chrome.permissions.contains({
           permissions: ['audioCapture','videoCapture']
         }, function(result) {
           if (result) {
             // The app has the permissions.
             e.originalEvent.request.allow();
           } else {
             // The app doesn't have the permissions.
             // request it
             $('#mediaPermission .ok').click(function(){
               chrome.permissions.request({
                 permissions: ['audioCapture','videoCapture']
               },function(granted){
                 if(granted) e.originalEvent.request.allow();
               });
             });
             $('#mediaPermission').modal('open');
           }
         });
       }else if(e.originalEvent.permission === 'fullscreen') {
          e.originalEvent.request.allow();
       }
     })
     .on('contentload',function(e){
       var browser = e.target;
       browser.executeScript({
         code:
            "window.addEventListener('message', function(e){"
          + "  if(e.data.command == 'kioskGetTitle'){"
          + "    e.source.postMessage({ title: document.title, id: e.data.id }, e.origin);"
          + "  }"
          + "});"
       });
       browser.contentWindow.postMessage({
        command: 'kioskGetTitle',
        id: $webview.parent().attr('id')
       }, '*');
       if(hidecursor)
         browser.insertCSS({code:"*{cursor:none;}"});
       if(disablecontextmenu)
         browser.executeScript({code:"window.oncontextmenu = function(){return false};"});
       if(disabledrag)
         browser.executeScript({code:"window.ondragstart = function(){return false};"});
       if(disabletouchhighlight)
         browser.insertCSS({code:"*{-webkit-tap-highlight-color: rgba(0,0,0,0); -webkit-touch-callout: none;}"});
       if(disableselection)
         browser.insertCSS({code:"*{-webkit-user-select: none; user-select: none;}"});
       browser.focus();
     })
     .on('loadcommit',function(e){
	      if(useragent) e.target.setUserAgentOverride(useragent);
        if(reset){
          ACTIVE_EVENTS.split(' ').forEach(function(type,i){
            $webview[0].executeScript({
              code: "document.addEventListener('"+type+"',function(){console.log('kiosk:active')},false)"
            });
          });
        }
     });
     if(allownewwindow){
       $webview.on('newwindow',function(e){
        $('#newWindow webview').remove();
         var $newWebview = $('<webview/>');
         initWebview($newWebview);
         $newWebview.on('close',function(e){
           $('#newWindow').modal('close');
           $('#newWindow webview').remove();
         });
         e.originalEvent.window.attach($newWebview[0]);
         $('#newWindow').append($newWebview).modal('open');
       })
       .on('dialog',function(e){
        var $modal;
        if(e.originalEvent.messageType == "alert"){
          $modal = $('#dialogAlert');
        }/*else if(e.originalEvent.messageType == "confirm"){ //Confirmation and Prompts currently non-functional
            $modal = $('#dialogConfirm');
        }else if(e.originalEvent.messageType == "prompt"){
            $modal = $('#dialogPrompt');
            $modal.find('.input-field > input').attr('placeholder',e.originalEvent.defaultPromptText);
        }*/
        if($modal){
          //e.preventDefault();
          $modal.find('.text').text(e.originalEvent.messageText);
          $modal.modal('open');
          $modal.find('a.ok').click(function(){
            $modal.modal('close');
            e.originalEvent.dialog.ok($modal.find('#promptValue').val());
            return;
          });
          $modal.find('a.cancel').click(function(){
            $modal.modal('close');
            e.originalEvent.dialog.cancel();
            return;
          });
        }
      });
    }
  }

  function loadContent(){
    active(); //we should reset the active on load content as well
    if(!currentURL) return;
    if(!Array.isArray(currentURL)) currentURL = [currentURL];
    $('#content .browser').remove();
    $('#tabs .tab').remove();
    if(Array.isArray(currentURL) && currentURL.length > 1){
      $('body').addClass('tabbed');
    }else{
      $('body').removeClass('tabbed');
    }
    if(resetcache) partition = null;
    if(!partition){
      partition = "persist:kiosk"+(Date.now());
      chrome.storage.local.set({'partition':partition});
    }
    var colClass = 's1';
    switch(currentURL.length){
      case 1:
        colClass = 's12';
        break;
      case 2:
        colClass = 's6';
        break;
      case 3:
        colClass = 's4';
        break;
      case 4:
        colClass = 's3';
        break;
      case 5:
        colClass = 's2';
        break;
      case 6:
        colClass = 's2';
        break;
    }
    for(var i = 0; i < currentURL.length; i++){
      addURL(currentURL[i],i,colClass);
    }
    var $tabs = $('ul.tabs');
    if(currentURL.length > 12){
      $tabs.addClass('scroll');
    }else{
      $tabs.removeClass('scroll');
    }
    $tabs.tabs();
  }

  function addURL(url, i, colClass){
    var id = "browser"+i;
    var $tab = $('<li class="tab col '+colClass+' '+id+'"><a href="#'+id+'">'+url+'</a></li>').appendTo('#tabs .tabs');
    var $webviewContainer = $('<div id="'+id+'" class="browser"/>');
    $webviewContainer.appendTo('#content');
    var $webview = $('<webview />');
    initWebview($webview);
    $webview
     .data('id',id)
     .attr('src',url)
     .appendTo($webviewContainer);
     if(resetcache) {
       chrome.storage.local.remove('resetcache');
       resetcache = false;
       var clearDataType = {
         appcache: true,
         cache: true, //remove entire cache
         cookies: true,
         fileSystems: true,
         indexedDB: true,
         localStorage: true,
         webSQL: true,
       };
       $webview[0].clearData({since: 0}, clearDataType, loadContent);
     }
  }

  function onEnded(event){
    if(!restarting){
      restarting = true;
      $("#browserContainer").remove();
      setTimeout(function(){
        loadContent();
        restarting = false;
      },RESTART_DELAY);
   }
  }

  function openWindow(path){
    chrome.system.display.getInfo(function(d){
      chrome.app.window.create(path, {
        'frame': 'none',
        'id': 'setup',
        'state': 'fullscreen',
        'bounds':{
           'left':0,
           'top':0,
           'width':d[0].bounds.width,
           'height':d[0].bounds.height
        }
      },function(w){
        chrome.app.window.current().close();
        win = w;
        if(win){
          win.fullscreen();
          setTimeout(function(){
            if(win) win.fullscreen();
          },1000);
        }
      });
    });
  }

});
