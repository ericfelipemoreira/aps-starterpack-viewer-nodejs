/// import * as Autodesk from "@types/forge-viewer";

function CustomTools(viewer, options) {
  Autodesk.Viewing.Extension.call(this, viewer, options);
}

CustomTools.prototype = Object.create(Autodesk.Viewing.Extension.prototype);
CustomTools.prototype.constructor = CustomTools;

CustomTools.prototype.load = function () {
  //Only loading... nothing to do here
  return true;
};

CustomTools.prototype.unload = function () {

  if(this.subToolbar) {
    this.viewer.toolbar.removeControl(this.subToolbar);
    this.subToolbar = null;
  }

  return true;
};

Autodesk.Viewing.theExtensionManager.registerExtension(
  "CustomTools",
  CustomTools
);

CustomTools.prototype.onToolbarCreated = function (toolbar) {
  var viewer = this.viewer;

  // Button Print
  var buttonPrint = new Autodesk.Viewing.UI.Button("adsk-icon-print");
  buttonPrint.onClick = function (e) {
    viewer.impl.canvas.toBlob(function (blob) {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      img.onload = function () {
        const printWindow = window.open("", "_blank");
        printWindow.document.write(`
                      <html>
                          <head>
                              <title>Print Viewer</title>
                              <style>
                                  body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
                                  img { max-width: 100%; max-height: 100%; }
                              </style>
                          </head>
                          <body>
                              <img src="${img.src}" />
                          </body>
                      </html>
                  `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        printWindow.close();
        URL.revokeObjectURL(url);
      };
    });
  };
  buttonPrint.addClass("adsk-icon-print");
  buttonPrint.setToolTip("Print");

  // SubToolbar
  this.subToolbar = new Autodesk.Viewing.UI.ControlGroup("my-custom-toolbar");
  this.subToolbar.addControl(buttonPrint);

  toolbar.addControl(this.subToolbar);
};


