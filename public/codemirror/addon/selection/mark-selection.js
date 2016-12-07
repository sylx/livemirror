// Because sometimes you need to mark the selected *text*.
//
// Adds an option 'styleSelectedText' which, when enabled, gives
// selected text the CSS class given as option value, or
// "CodeMirror-selectedtext" when the value is not a string.

(function() {
    "use strict";

    CodeMirror.defineOption("styleSelectedText", false, function(cm, val, old) {
            var prev = old && old != CodeMirror.Init;
        if (val && !prev) {
            cm.state.markedSelection = [];
            cm.state.markedSelectionStyle = typeof val == "string" ? val : "CodeMirror-selectedtext";
            reset(cm);
            cm.on("cursorActivity", onCursorActivity);
            cm.on("change", onChange);
            cm.on("viewportChange", onViewportChange);
        } else if (!val && prev) {
            cm.off("cursorActivity", onCursorActivity);
            cm.off("change", onChange);
            clear(cm);
            cm.state.markedSelection = cm.state.markedSelectionStyle = null;
        }
    });

    function onCursorActivity(cm) {
        cm.operation(function() { update(cm); });
    }

    function onChange(cm) {
        if (cm.state.markedSelection.length)
            cm.operation(function() { clear(cm); });
    }

    var old_vp={from: 0,to:0};
    var qq=[];
    function onViewportChange(cm,from,to){

        cm.markText({line: from,ch:0},{line: to,ch: 9999});
        var marks=cm.markText({line: from,ch:0},{line: to,ch: 9999},{className: "cm-text"});
        
        for(var i=from;i<to;i++){
            var genf=function(i){
                return function(){
                var line = cm.getLineHandleVisualStart(i);
                if(line){
                    cm.addLineClass(line,"wrap","CodeMirror-appeared");
                    setTimeout(function(){
                        var f=qq.shift();
                        if(f) f();
                    },50);
                }};
            };
            var f=genf(i);
            qq.push(f);
        }
        var f=qq.shift();
        if(f) f();
        
        old_vp.from=from;
        old_vp.to=to;
    }

    var CHUNK_SIZE = 8;
    var Pos = CodeMirror.Pos;

    function cmp(pos1, pos2) {
        return pos1.line - pos2.line || pos1.ch - pos2.ch;
    }

    function coverRange(cm, from, to, addAt) {
        if (cmp(from, to) == 0) return;
        //      console.log(from,to,addAt);
            
        var array = cm.state.markedSelection;
        var cls = cm.state.markedSelectionStyle;
        for (var line = from.line;;) {
            var start = line == from.line ? from : Pos(line, 0);
            var endLine = line + CHUNK_SIZE, atEnd = endLine >= to.line;
            var end = atEnd ? to : Pos(endLine, 0);
            var mark = cm.markText(start, end, {className: cls});
            if (addAt == null) array.push(mark);
            else array.splice(addAt++, 0, mark);
            if (atEnd) break;
            line = endLine;
        }
    }

    function clear(cm) {
        var array = cm.state.markedSelection;
        for (var i = 0; i < array.length; ++i) array[i].clear();
        array.length = 0;
    }

    function reset(cm) {
        clear(cm);
        var from = cm.getCursor("start"), to = cm.getCursor("end");
        coverRange(cm, from, to);
    }

    function update(cm) {
        var from = cm.getCursor("start"), to = cm.getCursor("end");
        if (cmp(from, to) == 0){
            clear(cm);
            from.ch=0;
            to.ch=cm.getLineHandle(from.line).text.length;
            //        return clear(cm);
        }

        var array = cm.state.markedSelection;
        if (!array.length) return coverRange(cm, from, to);

        var coverStart = array[0].find(), coverEnd = array[array.length - 1].find();
        if (!coverStart || !coverEnd || to.line - from.line < CHUNK_SIZE ||
            cmp(from, coverEnd.to) >= 0 || cmp(to, coverStart.from) <= 0)
            return reset(cm);

        while (cmp(from, coverStart.from) > 0) {
            array.shift().clear();
            coverStart = array[0].find();
        }
        if (cmp(from, coverStart.from) < 0) {
            if (coverStart.to.line - from.line < CHUNK_SIZE) {
                array.shift().clear();
                coverRange(cm, from, coverStart.to, 0);
            } else {
                coverRange(cm, from, coverStart.from, 0);
            }
        }

        while (cmp(to, coverEnd.to) < 0) {
            array.pop().clear();
            coverEnd = array[array.length - 1].find();
        }
        if (cmp(to, coverEnd.to) > 0) {
            if (to.line - coverEnd.from.line < CHUNK_SIZE) {
                array.pop().clear();
                coverRange(cm, coverEnd.from, to);
            } else {
                coverRange(cm, coverEnd.to, to);
            }
        }
    }
})();
