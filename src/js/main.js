chrome.app.runtime.onLaunched.addListener(init);
chrome.app.runtime.onRestarted.addListener(init);

var directoryServer, adminServer, restartTimeout;

function init() {

  var win, basePath, socketInfo, data;
  var filesMap = {};

  /*
  LOG PERMISSION WARNINGS
  use to test manifest permissions changes
  DO NOT publish if new warnings are triggered. Prompt on existing
  installations would likely be a major issue.

  Current permission warnings are:
  -"Exchange data with any device on the local network or internet",
  -"Read folders that you open in the application"

  Should be commented out in production application.
  */
  /*chrome.management.getPermissionWarningsByManifest(
    JSON.stringify(chrome.runtime.getManifest()),
    function(warning){
      console.log("PERMISSION WARNIINGS",warning);
    }
  );*/
  
  var manifestData = chrome.runtime.getManifest();
  var url_manifest = manifestData.app.remote_url;
  var username_manifest = manifestData.app.username;
  var password_manifest = manifestData.app.password;
	
  chrome.storage.local.get(null,function(data){
	  
	//if(!data.hardwareid) {
	  //deviceid = "default123-default123-default123-default123";
	  chrome.enterprise.deviceAttributes.getDirectoryDeviceId(function(deviceid) {
		    if(deviceid) {
		    	if (deviceid.indexOf("-") != -1) {
		    		deviceid = deviceid.substring(deviceid.lastIndexOf("-")+1);
		    		chrome.storage.local.set({'hardwareid':deviceid});
		    	}
		    }
		    else chrome.storage.local.remove('hardwareid');
	  });
	//}
	    
    if(('url' in data)){
      //setup has been completed
    	
      var rotateVal=0;
  	  if(data.rotateval) {
  		   rotateVal = data.rotateval;
  	  }
  	  
  	  chrome.system.display.getInfo(function(d){
  	    chrome.system.display.setDisplayProperties(d[0].id,{'rotation':rotateVal}, function() {
  	    });
      });

      // Sleepmode may not have been selected by user in setup because it
      // is a new config param, so assume the previous hard-coded value as
      // default.
      if (!data.sleepmode) {
        chrome.storage.local.set({'sleepmode': 'display'});
        data.sleepmode = 'display';
      }
      if (data.sleepmode == 'none') {
        chrome.power.releaseKeepAwake();
      } else {
        chrome.power.requestKeepAwake(data.sleepmode);
      }

      if(data.servelocaldirectory && data.servelocalhost && data.servelocalport){
        //serve files from local directory
        chrome.fileSystem.restoreEntry(data.servelocaldirectory,function(entry){
          //if we can't get the directory (removed drive possibly)
          //wait 15 seconds and reload the app
          if(!entry){
            restartTimeout = setTimeout(function(){
              chrome.runtime.sendMessage('reload');
            }, 300*1000);
            return
          }

          var host = data.servelocalhost;
          var port = data.servelocalport;
          startWebserverDirectoryEntry(host,port,entry);
        });
      }
      if(data.host && data.port){
        //make setup page available remotely via HTTP
        startWebserver(data.host,data.port,'www',data);
      }
      openWindow("windows/browser.html");
    }else{
      //need to run setup
	  var actual_JSON;
	  loadJSON(function(response) {
	   // Parse JSON string into object
		  var isSetupValid = false;
		 if(response != null) {
			 actual_JSON = JSON.parse(response);
			 isSetupValid = initialSetUp(actual_JSON, url_manifest, username_manifest, password_manifest);
		 }
		 if (isSetupValid) {
			 openWindow("windows/browser.html");
		 } else {
			 openWindow("windows/setup.html");
		 }
	  }, url_manifest);
      //openWindow("windows/setup.html");
    }
  });

  chrome.runtime.onMessage.addListener(function(request,sender,sendResponse){
    if(request == "reload"){
      chrome.runtime.getPlatformInfo(function(p){
        if(p.os == "cros"){
          //we're on ChromeOS, so `reload()` will always work
          chrome.runtime.reload();
        }else{
          //we're OSX/Win/*nix so `reload()` may not work if Chrome is not
          // running the background. Simply close all windows and reset.
          if(directoryServer) directoryServer.stop();
          if(adminServer) adminServer.stop();
          var w = chrome.app.window.getAll();
          for(var i = 0; i < w.length; i++){
            w[i].close();
          }
          init();
        }
      });
    }
  });

  function openWindow(path){
    if(win) win.close();
    chrome.system.display.getInfo(function(d){
	
      chrome.app.window.create(path, {
        'frame': 'none',
        'id': 'browser',
        'state': 'fullscreen',
        'bounds':{
           'left':0,
           'top':0,
           'width':d[0].bounds.width,
           'height':d[0].bounds.height
        }
      },function(w){
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

  function startWebserverDirectoryEntry(host,port,entry) {
    directoryServer = new WSC.WebApplication({host:host,
                                              port:port,
                                              renderIndex:true,
                                              entry:entry
                                             })
    directoryServer.start()
  }

  //directory must be a subdirectory of the package
  function startWebserver(host,port,directory,settings){
    chrome.runtime.getPackageDirectoryEntry(function(packageDirectory){
      packageDirectory.getDirectory(directory,{create: false},function(webroot){
        var fs = new WSC.FileSystem(webroot)
        var handlers = [['/data.*', AdminDataHandler],
                        ['.*', WSC.DirectoryEntryHandler.bind(null, fs)]]
        adminServer = new WSC.WebApplication({host:host,
                                              port:port,
                                              handlers:handlers,
                                              renderIndex:true,
                                              auth:{ username: settings.username,
                                                     password: settings.password }
                                             })
        adminServer.start()
      });
    });
  }
}

function stopAutoRestart(){
  if(restartTimeout) {
    clearTimeout(restartTimeout);
  }
}

function loadJSON(callback, url_manifest) {   

	var url = url_manifest+'/config.json?kiosk_t='+Date.now();
    var xobj = new XMLHttpRequest();
        xobj.overrideMimeType("application/json");
    xobj.open('GET', url, true);
    xobj.onreadystatechange = function () {
	  if (xobj.readyState == 4) {  
	        if (xobj.status == 200) {  
	        	callback(xobj.responseText);
	        } else { 
	           callback(null);
	        }  
	  } 
    };
    xobj.send(null);  
}

function initialSetUp(actual_JSON, url_manifest, username_manifest, password_manifest) {
	
	var isValid=true;

    var url = actual_JSON.url;
    if(url){
      err = validateURL(url);
      if(err){
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
   
    var username = username_manifest;
    var password = password_manifest;

    if(!username){
    	isValid=false;
    	username="admin";
    }
    if(!password){
    	isValid=false;
    	password="admin";
    }
    chrome.storage.local.set({'username':username});
    chrome.storage.local.set({'password':password});
    
    var local=true;
    chrome.storage.local.set({'local':local});
     
    var remotescheduleurl = url_manifest;
    var schedulepollinterval = actual_JSON.remotepollinterval
    if (remotescheduleurl && (remotescheduleurl.indexOf("http://") >= 0 || remotescheduleurl.indexOf("https://") >= 0 )){
      //url is valid
      if(schedulepollinterval > 0 ){
    	  var remoteschedule=true;
	      chrome.storage.local.set({'remoteschedule':remoteschedule});
	      chrome.storage.local.set({'remotescheduleurl':remotescheduleurl});
	      chrome.storage.local.set({'schedulepollinterval':schedulepollinterval});
      } else {
    	  isValid=false;
      }
    } else {
    	isValid=false;
    }
    
    var hidecursor = actual_JSON.hidecursor;
    if(hidecursor) chrome.storage.local.set({'hidecursor':hidecursor});
    else chrome.storage.local.remove('hidecursor');
    
    var disablecontextmenu = actual_JSON.disablecontextmenu;
    if(disablecontextmenu) chrome.storage.local.set({'disablecontextmenu':disablecontextmenu});
    else chrome.storage.local.remove('disablecontextmenu');
    
    var disabledrag = actual_JSON.disabledrag;
    if(disabledrag) chrome.storage.local.set({'disabledrag':disabledrag});
    else chrome.storage.local.remove('disabledrag');
    
    var disabletouchhighlight = actual_JSON.disabletouchhighlight;
    if(disabletouchhighlight) chrome.storage.local.set({'disabletouchhighlight':disabletouchhighlight});
    else chrome.storage.local.remove('disabletouchhighlight');
    
    var disableselection = actual_JSON.disableselection;
    if(disableselection) chrome.storage.local.set({'disableselection':disableselection});
    else chrome.storage.local.remove('disableselection');
    
    var newwindow = actual_JSON.newwindow;
    if(newwindow) chrome.storage.local.set({'newwindow':newwindow});
    else chrome.storage.local.remove('newwindow');
    
    var useragent = actual_JSON.useragent;
    if(useragent) chrome.storage.local.set({'useragent':useragent});
    else chrome.storage.local.remove('useragent');
    
    var reset = actual_JSON.reset;
    if(reset && reset > 0) {
    	chrome.storage.local.set({'reset':reset});
    } else {
    	chrome.storage.local.remove('reset');
    }
    
    var restart = actual_JSON.restart;
    if(restart && (restart >= 0 && restart < 24)){
    	chrome.storage.local.set({'restart':restart});
    } else {
    	chrome.storage.local.remove('restart');
    }

    var sleepmode = actual_JSON.sleepmode;
    var arrDisplay =['display','system','none'];
    if (sleepmode && arrDisplay.includes(sleepmode)) {
    	chrome.storage.local.set({'sleepmode':sleepmode});
    } else {
    	sleepmode="display";
    	chrome.storage.local.set({'sleepmode':sleepmode});
    }
    
    var resetcache = actual_JSON.resetcache;
    if(resetcache) chrome.storage.local.set({'resetcache': resetcache});
    else chrome.storage.local.remove('resetcache');
    
    return isValid;
}

function validateURL(url){
    return url.indexOf("http://") >= 0 || url.indexOf("https://") >= 0 ? null : 'Invalid content URL';
}

function getIdByTime(){
	return new Date().getTime();
}
