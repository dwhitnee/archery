/* global */
/*jslint esversion: 8 */

//----------------------------------------
// Dialog handlers
//   Opens and closes dialogs when X clicked, outside dialog clicked, or ESC hit

// Usage:
//    let dh = new DialogManager();
//    dh.openDialog("nameOfDialog")
//    dh.closeDialog();

//  A lot of this is obsoleted by "light dismiss" when it's supported
//  <dialog closedby="any"> // clicking outside the dialog, or pressing ESC, closes the dialog.
//  <dialog closedby="none"> forces the X to be clicked
//
// Prerequisites:
//  dialog.css

//  <div id="dialogBackdrop"></div>  <-- handles greyed out background -->
//
//  <dialog id="nameOfDialog">
//    <button class="close" @click="closeDialog( $event )"></button>
//    ...
//----------------------------------------

class DialogManager {

  constructor() {
    this.currentDialog = null;
  }

  //----------------------------------------
  // @param name <dialog id="name">
  //----------------------------------------
  openDialog( name, openCallback ) {
    this.openDialogElement( document.getElementById( name ));
    if (openCallback)
      openCallback();
  }

  dialogIsOpen() {
    return this.currentDialog;
  }

  //----------------------------------------
  // @input button click that caused the close (ie, button),
  //    assumes it's a child of the dialog
  //----------------------------------------
  closeDialog( event ) {
    this.closeDialogElement( this.currentDialog );
    // this.closeDialogElement( event.target.closest("dialog") );
  }

  // @input dialog element itself
  openDialogElement( dialog ) {
    if (!dialog || this.dialogIsOpen()) {  // can't open two dialogs at once
      return;
    }
    // grey out app
    document.getElementById("dialogBackdrop").classList.add("backdropObscured");

    this.currentDialog = dialog;

    dialog.open = true;           // Chrome
    dialog.style.display="flex";  // Firefox/Safari

    this.addDialogDismissHandlers( dialog );  // outside click and ESC
  }


  //----------------------------------------------------------------------
  // close dialog, restore background, remove event handlers.
  // @input dialog element itself
  //----------------------------------------------------------------------
  closeDialogElement( dialog ) {
    document.getElementById("dialogBackdrop").classList.remove("backdropObscured");

    dialog.open = false;
    dialog.style.display="none";

    // dialog gone, stop listening for dismiss events
    let backdrop = document.getElementById("dialogBackdrop");
    backdrop.removeEventListener('click', this.closeDialogOnOutsideClick );
    document.body.removeEventListener("keydown", this.closeDialogOnESC );

    this.currentDialog = null;
  }

  //----------------------------------------------------------------------
  // Close on click outside dialog or ESC key.
  // Save functions for removal after close()
  //----------------------------------------------------------------------
  addDialogDismissHandlers( dialog ) {
    // FIXME, these event handlers happen after Vue event
    // handlers so you can play the game while a dialog is
    // open.  How to disable all of game wile dialog is open?

    this.closeDialogOnOutsideClick = (event) => {
      const clickWithinDialog = event.composedPath().includes( dialog );
      if (!clickWithinDialog) {
        this.closeDialogElement( dialog );
      }
    };
    this.closeDialogOnESC = (event) => {
      if (event.keyCode === 27) {
        this.closeDialogElement( dialog );
      }
    };

    // Could also use dialog::backdrop, but it is not fully supported
    // Fake our own backdrop element to swallow clicks and grey out screen
    // by not using "body" we don't need to worry about click bubbling
    let backdrop = document.getElementById("dialogBackdrop");
    backdrop.addEventListener('click', this.closeDialogOnOutsideClick );
    document.body.addEventListener("keydown", this.closeDialogOnESC );
  }

}
