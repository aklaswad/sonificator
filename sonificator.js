// Sonificator Loader

;(function () {

function __wait ( watcher, success, error ) {
    var interval;
    var retry = 50;
    interval = setInterval( function () {
        if ( watcher() ) {
            clearInterval(interval);
            if ( success ) success();
            return;
        }
        retry--;
        if ( retry <= 0 ) {
            clearInterval(interval);
            if ( error ) error();
        }
    }, 200);
}

function __loadScript( src, watcher, success ) {
    if ( watcher && watcher() ) {
        if ( success ) success();
        return;
    }
    var script = document.createElement('script');
    var body   = document.getElementsByTagName('body').item(0);
    script.setAttribute('src', src);
    body.appendChild(script);
    if ( watcher ) {
        __wait( watcher, success, function () { console.log('Failed to load script: ' + src )} );
    }
    else if ( success ) {
        success();
    }
}

function loadScripts (scripts, cb) {
    var postLoad = cb;
    for ( var i = scripts.length - 1; i >= 0; i-- ) {
        postLoad = ( function (cb) {
            var asyncSet = scripts[i];
            return function () {
                var flags = [];
                for ( var i = 0; i < asyncSet.length; i++ ) {
                    ( function (idx) {
                        var src     = asyncSet[idx][0];
                        var watcher = asyncSet[idx][1];
                        __loadScript(src, watcher, function () {
                            flags[idx] = true;
                        });
                    })(i);
                }
                __wait( function(){
                    var ok = true;
                    for ( var i = 0; i < asyncSet.length; i++ ) {
                        if ( !flags[i] ) ok = false;
                    }
                    return ok;
                }, cb );
            };
        })(postLoad);
    }
    postLoad();
}

// Way to override sonificator src.
var soni_src = window.__sonificator_url
             || "https://aklaswad.github.io/sonificator/jquery.sonificator.js";

loadScripts([
    [[
        "https://ajax.googleapis.com/ajax/libs/jquery/1.6.4/jquery.min.js",
        function () { return window.jQuery }
    ]],
    [[
        soni_src,
        function () { return window.jQuery.sonificator }
    ]],
], function () { jQuery.sonificator.play(); });

})();
