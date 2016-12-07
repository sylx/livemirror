CodeMirror.defineMode("webcast", function(config, parserConfig) {
    var webcastOverlay = {
        token: function(stream, state) {
            if(stream.sol() && stream.eat(/[ \t]/)){
                while(stream.eat(/[ \t]/)){}
                return "indent";
            }else{
                stream.skipToEnd();
                return "text";
            }
        }
    };
    return CodeMirror.overlayMode(CodeMirror.getMode(config, parserConfig.backdrop || "text/html"),
                                  webcastOverlay,true);
});

!function($){
    var editor;
    var ws;
    var myid;
    var no_transmit=false;
    var cursor;

    function createEditor(){
        var editor=CodeMirror.fromTextArea(document.getElementById("editor"), {
            fullScreen: true,
            lineNumbers: true,
            lineWrapping: true,
            readOnly: true,
            mode: "text/html",
            styleActiveLine: true,
            matchBrackets: true,
            autofocus: true,
            theme: 'mid-school2',
            cursorScrollMargin: 50
        });
        return editor;
    }
    
    function connect(editor){
        var emptyText=$("#editor").text();
        ws = new WebSocket('ws://'+location.host+location.pathname+'slave');

        ws.onopen = function () {
            console.log('connected');
        };
        ws.onclose = function (ev) {
            setTimeout(function(){connect(editor);},1000);
        };

        var cursor_mode="cursor";
        ws.onmessage = function (ev) {
            console.log("receive");
            var data;
            try {
                data=JSON.parse(ev.data);                
            } catch (x) {
                console.log(x,ev.data);
            }

            if(data.id && data.id === myid){
                return;
            }
            
            if(data.type === "master_disconnect"){
                editor.setOption("mode",{name: "text"});
                editor.setValue(emptyText);
            }else if(data.type === "text"){
                console.log("receive text");
                function setMode(mode){
                    if(editor.getOption("mode") != mode){
                        console.log(editor.getOption("mode"),mode);
                        //                        editor.setOption("mode",mode);
                        editor.setOption("mode",{name: "webcast",backdrop: mode});
                    }
                }
                if(data.mode){
                    if(data.mode.match(/lisp/)){
                        setMode("scheme");
                    }else if(data.mode.match(/js2/) || data.mode.match(/javascript/)){
                        setMode("javascript");
                    }else if(data.mode.match(/web/) || data.mode.match(/html/)){
                        setMode("text/html");
                    }else if(data.mode.match(/perl/)){
                        setMode("perl");
                    }else if(data.mode.match(/php/)){
                        setMode("php");
                    }else if(data.mode.match(/less/)){
                        setMode("less");
                    }else if(data.mode.match(/css/)){
                        setMode("text/css");
                    }else{
                        setMode("text");
                    }
                            }
                    editor.setValue(data.text);
                    if(cursor){
                        editor.getDoc().setCursor(cursor);
                    }
                }else if(data.type === "change"){

                    function getPosAfter(start,lng){
                        var doc=editor.getDoc();
                        var count=0;
                        var it={
                            line: start.line,
                            ch: start.ch
                        },s;
                        while(1){
                            s=doc.getRange(it,
                                           {line: it.line,ch: 9999});
                            var vl=s ? s.length + 1 : 1;
                            count+= vl;
                            if(count >= data.lng){
                                it.ch+=vl - (count - data.lng);
                                break;
                            }
                            it.line++;
                            it.ch=0;
                        }
                        s=doc.getLine(it.line);
                        if(!s || s.length < it.ch){
                            //empty line or tail newline deleted
                            it.line++;
                            it.ch=s ? it.ch - s.length : 0;
                        }
                        return it;
                    }
                    
                    var p1=new CodeMirror.Pos(data.begin.line,data.begin.col),
                        p2=new CodeMirror.Pos(data.end.line,data.end.col);

                    if(data.mode == "insert"){
                        console.log("insert",p1,data.mtext);
                        editor.getDoc().setCursor(p1);
                        editor.replaceSelection(data.mtext,"end");
                    }else if(data.mode == "overwrite"){
                        console.log("overwrite",p1,p2,data.mtext);
                        editor.replaceRange(data.mtext,p1,p2);
                    }else if(data.mode == "delete"){
                        console.log("delete",p1,getPosAfter(p1,data.lng),data.lng);
                        editor.getDoc().setSelection(p1,getPosAfter(p1,data.lng));
                        editor.replaceSelection("","end");
                    }
                    
                    // if(data.lng==0 && data.mtext.substr(-1,1) === "\n"){
                    //     editor.replaceSelection("\n","end","+text");
                    // }else if(data.lng > 0 && data.ltext.length > 0 && (data.e_col - data.s_col) == 0){
                    //     editor.getDoc().removeLine(data.s_line-1);
                    // }else{
                    //     editor.replaceRange(data.ltext,p1,p2);
                    // }
                }else if(data.type == "cursor" && cursor_mode == "cursor"){
                    var p=new CodeMirror.Pos(data.cursor.line,data.cursor.col);
                    editor.getDoc().setCursor(p);
                }else if(data.type == "selection"){
                    console.log(data);
                    var p1=new CodeMirror.Pos(data.begin.line,data.begin.col),
                        p2=new CodeMirror.Pos(data.end.line,data.end.col);

                    editor.getDoc().setSelection(p1,p2);
                }else if(data.type == "scroll"){
                    // notransmit(function(){                
                    //     editor.scrollTo(data.top);
                    // });
                }else if(data.type == "reload"){
                    location.reload();
                }else{
                    console.log(data);
                }
            };
            ws.onerror = function (ev) {
                console.log(ev);
            };

            return ws;
        }

        $(function(){
            window.editor= editor = createEditor();
            if($(window).width() < 600){
                $(".CodeMirror-code").css({
                    "font-size": "12px",
                    "line-height": "1"
                });
            }
            connect(editor);
        });
    }(jQuery);
