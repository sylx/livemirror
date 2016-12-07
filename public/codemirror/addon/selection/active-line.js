// Because sometimes you need to style the cursor's line.
//
// Adds an option 'styleActiveLine' which, when enabled, gives the
// active line's wrapping <div> the CSS class "CodeMirror-activeline",
// and gives its background <div> the class "CodeMirror-activeline-background".

(function() {
    var WRAP_CLASS = "CodeMirror-activeline";
    var WRAP_CLASS_IN = "CodeMirror-inactiveline";
    var BACK_CLASS = "CodeMirror-activeline-background";
    var WRAP_CLASS_SEL = "CodeMirror-selectedline";

  CodeMirror.defineOption("styleActiveLine", false, function(cm, val, old) {
    var prev = old && old != CodeMirror.Init;
    if (val && !prev) {
      updateActiveLine(cm, cm.getCursor().line);
      cm.on("beforeSelectionChange", selectionChange);
    } else if (!val && prev) {
      cm.off("beforeSelectionChange", selectionChange);
      clearActiveLine(cm);
      delete cm.state.activeLine;
    }
  });

  function inactivateLine(cm,line){
      cm.addLineClass(line, "wrap", WRAP_CLASS_IN);
      setTimeout(function(){
          cm.removeLineClass(line, "wrap", WRAP_CLASS_IN);
      },1000);
  }

  function clearActiveLine(cm) {
      if ("activeLine" in cm.state) {
          inactivateLine(cm,cm.state.activeLine);
          cm.removeLineClass(cm.state.activeLine, "wrap", WRAP_CLASS);
          cm.removeLineClass(cm.state.activeLine, "background", BACK_CLASS);
      }
      if ("selectedline" in cm.state){
          cm.state.selectedline.forEach(function(x){
              cm.removeLineClass(x,"wrap",WRAP_CLASS_SEL);
          });
          cm.state.selectedline=[];
      }
  }

  function updateActiveLine(cm, selectedLine) {
      var line = cm.getLineHandleVisualStart(selectedLine);
      if (cm.state.activeLine == line) return;
      cm.operation(function() {
          clearActiveLine(cm);
          cm.addLineClass(line, "wrap", WRAP_CLASS);
          cm.addLineClass(line, "background", BACK_CLASS);
          cm.state.activeLine = line;
      });
  }

  function selectionChange(cm, sel) {
      updateActiveLine(cm, sel.head.line);
      if(sel.anchor.line != sel.head.line){
          if(!cm.state.selectedline){
              cm.state.selectedline=[];
          }
          var start=Math.min(sel.anchor.line,sel.head.line),
          end=Math.max(sel.anchor.line,sel.head.line);
          for(var i=start;i<=end;i++){
              var line = cm.getLineHandleVisualStart(i);
              if(line && cm.state.activeline != line){
                  cm.addLineClass(line,"wrap",WRAP_CLASS_SEL);
                  cm.state.selectedline.push(line);
              }
          }
      }
  }
})();
