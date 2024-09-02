/*global fetch, Vue, VueRouter, Util */
/*jslint esversion: 8 */
//-----------------------------------------------------------------------
//  Copyright 2024, David Whitney
//  This file is part of Tournament Tools

// Archery Tournament Scorer is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//-----------------------------------------------------------------------


// TODO:
  // All the things

//----------------------------------------------------------------------
//  OVERVIEW
//----------------------------------------------------------------------
//  A VueJS 2.1 app for entering and viewing archery tournament results
//
//  ----------------------------------------------------------------------

// AWS Lambda serverless API deployment endpoint

let dev = true;  // if on a desktop (ie, not deployed)

// FIXME: new lambda?
let serverURL = "https://ox5gprrilk.execute-api.us-west-2.amazonaws.com/prod/";
if (dev) {
  serverURL = "https://317bll5em3.execute-api.us-west-2.amazonaws.com/dev/";
}


// Vue-router 3
var router = new VueRouter({
  mode: 'history',
  routes: [ ]
});


let app = new Vue({
  router,
  el: '#tournamentApp',

  //----------------------------------------
  // Data Model (drives the View, update these values only
  //----------------------------------------
  data: {
    message: "Lets do a tournament",
    saveInProgress: false,    // prevent other actions while this is going on
    loadingData: false,    // prevent other actions while this is going on
    adminView: false,

    foo: "foo",
    joinId: "",  // tournament to join
    tournament: { },
    bale: [],  // archers in this scoring group

    newArcher: {},

    tournamentTypes: [
      {
        "description": "WA 300",
        "arrows": 3, "ends": 10
      },
      {
        "description": "Blueface 300",
        "arrows": 5, "ends": 12
      },
      {
        "description": "Outdoor 720",
        "arrows": 6, "ends": 12
      },
      {
        "description": "NFAA 900",
        "arrows": 5, "ends": 15
      }
    ],


    showCredits: false,
    version: "0.1"  // create a tournament
  },

  //----------------------------------------
  // derived attributes, mostly conveniences to pull out of server
  // state for easier rendering
  //----------------------------------------
  computed: {
    // for feedback, this gets cached in DOM when <a> tag built
    deviceData() {
          let CRLF = "%0D%0A";
          return CRLF + "----" + CRLF +
            "build: " + this.version + CRLF +
            "Resolution: " + window.screen.availWidth + "x" +
            window.screen.availHeight + CRLF +
            "Viewport: " + window.innerWidth + "x" + window.innerHeight + CRLF +
            "UserAgent: " + navigator.userAgent + CRLF +
            "";
    },
  },

  //----------------------------------------
  // display format
  //----------------------------------------
  filters: {
    minSecondsFormat: function( inSeconds ) {
      let seconds = inSeconds % 60;
      seconds = seconds < 10 ? "0"+seconds : seconds;
      return Math.floor( inSeconds/60 ) + ":" + seconds;
    }
  },

  //----------------------------------------
  // We spin until game loaded so this can be anywhere in lifecycle
  //----------------------------------------
  async mounted() {
    // handle broken promises.
    window.addEventListener('unhandledrejection', function(event) {
      console.error("Rat farts " + JSON.stringify( event ));
      // alert("Rat farts " + JSON.stringify( event ));
      debugger;
    });

    let id = this.$route.query.id;
    if (id) {
      await this.loadTournament( id );
    }

    this.handleKeypress = (event) => {
      if (event.shiftKey && (event.key === "C")) {
        console.log("Coach view!");
        this.openDialog("coachView");
      }
    };
    document.body.addEventListener("keydown", this.handleKeypress );

    // this.setMessage( thisWeeksFocus );
  },

  // synchronous app setup before event handling starts
  beforeCreate: function() {
  },

  //----------------------------------------------------------------------
  // event handlers and other things that should not be computed
  // functions are accessible from the web page
  //----------------------------------------------------------------------
  methods: {
    // set the message to display lcoally, keep it for 2-3 cycles (6 seconds)
    // (otherwise local messages disappear too fast)
    setMessage: function( message, pause ) {
      this.message = message;
      pause = pause || 0;
      this.messageCountdown = pause + 1;
    },

    inProgress: function() {
      return this.saveInProgress || this.loadingData;
    },

    joinTournament: function() {
      this.joinId = this.joinId.toUpperCase();
      this.loadTournament( this.joinId );
    },

    // save to DB
    createTournament: function( event ) {
      if (!this.tournament.name) {
        alert("Please add a description for your tournament");
        return;
      }
      if (!this.tournament.type) {
        alert("Please select a tournament type");
        return;
      }

      this.tournament.id = this.createNewTournamentId();
      this.saveTournament( this.tournament );

      // hack to dismiss modal, maybe store dialog element when opening?
      this.closeDialogElement( event.target.parentElement.parentElement.parentElement );

      this.$forceUpdate();  // deep change to this.tournament does not trigger update
    },

    createNewTournamentId: function() {
      return "XYZPDQ";
    },

    loadTournament: function( id ) {
      this.loadLocalTournament( id );
      this.setMessage( this.tournament.name );
    },
    saveTournament: function( tournament ) {
      this.saveLocalTournament( tournament );
      this.setMessage( this.tournament.name );
    },

    loadLocalTournament: function( id ) {
      if (id) {
        this.tournament = Util.loadData("tournament"+ id) || {};
      }
    },
    saveLocalTournament: function( tournament ) {
      Util.saveData("tournament"+ tournament.id, tournament );
    },

    //----------------------------------------
    async editArrows( event, index ) {
      if (this.coachView) { this.endEdit(); return; }

      this.handleArrowUpdate();

      // SAVE TO DB (cloud or local)
      await this.updateArcherArrows();

      this.endEdit();
    },

    addNewArcher: function() {
      this.newArcher.bowClass = "FSLR";
      this.newArcher.ageGender = "AF";

      this.bale.push( this.newArcher );
      this.newArcher = {};
    },

    removeArcherFromBale: function( archer ) {
      this.bale.push( archer );

    },


    //----------------------------------------
    // Dialog handlers
    //----------------------------------------
    openDialog( name, openCallback ) {
      this.openDialogElement( document.getElementById( name ));
      if (openCallback)
        openCallback();
    },
    // @input button click that caused the close (ie, button),
    //    assumes it's the immediate child of the dialog
    closeDialog( event ) {
      this.closeDialogElement( event.target.parentElement );
    },
    // @input dialog element itself
    openDialogElement( dialog ) {
      if (this.dialogIsOpen) {  // can't open two dialogs at once
        return;
      }
      // grey out game
      document.getElementById("dialogBackdrop").classList.add("backdropObscured");
      this.dialogIsOpen = true;  // flag to disable other dialogs. Vue doesn't respect this on change(in v-if)?

      dialog.open = true;           // Chrome
      dialog.style.display="flex";  // Firefox/Safari

      this.addDialogDismissHandlers( dialog );  // outside click and ESC
    },

    //----------------------------------------------------------------------
    // close dialog, restore background, remove event handlers.
    // @input dialog element itself
    //----------------------------------------------------------------------
    closeDialogElement( dialog ) {
      document.getElementById("dialogBackdrop").classList.remove("backdropObscured");

      this.dialogIsOpen = false;  // FIXME: Vue is not seeing this; Do we just need to add it to the data() section?
      dialog.open = false;
      dialog.style.display="none";

      // dialog gone, stop listening for dismiss events
      let backdrop = document.getElementById("dialogBackdrop");
      backdrop.removeEventListener('click', this.closeDialogOnOutsideClick );
      document.body.removeEventListener("keydown", this.closeDialogOnESC );
    },

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
    },


    //----------------------------------------------------------------------
    // SERVER CALLS
    //----------------------------------------------------------------------

    //----------------------------------------
    // on login, get what we know about this archer
    //----------------------------------------
    async getTournament( id ) {
      if (!id) {
        console.log("No tournament id to load");
        return;
      }
      try {
        this.loadingData = true;
        let response = await fetch(serverURL + "tournament?id=" + id );
        if (!response.ok) { throw await response.json(); }
        let tournament = await response.json();
        if (tournament.id) {
          this.tournament = tournament;
        }
      }
      catch( err ) {
        alert("Problem getting tournament " + Util.sadface + (err.message || err));
      }
      this.loadingData = false;
    },

    //----------------------------------------
    // save attributes
    // archer/end, tournament,
    //----------------------------------------
    async updateFoo() {
      if (this.loadingData) {
        return;  // don't allow updates while still loading from DB
      }

      this.saveLocalArcher();

      if (!this.id) {
        // we are anonymous, can't to save to remote DB?
        // alert("No archer ID specified. Can't save to cloud without login");
        return;
      }

      if (this.saveInProgress) { return; }

      try {
        this.saveInProgress = true;
        let postData = this.foo;

        let response = await fetch( serverURL + "updateTournament",
                                    Util.makeJsonPostParams( postData ));
        if (!response.ok) { throw await response.json(); }

        // refresh our local data with whatever goodness the DB thinks we should have (last updated, version)
        let archer = await response.json();
        console.log("update resulted in " + JSON.stringify( archer ));
        if (archer.id) {
          this.foo = archer;
        }
      }
      catch( err ) {
        console.error("Change name: " + JSON.stringify( err ));
        alert("Try again. Change name failed " +
              Util.sadface + (err.message || err));
      }

      this.saveInProgress = false;
    },



    //----------------------------------------
    // load all names
    //----------------------------------------
    async loadAllTournaments() {
      // go get all archers for coach view
      try {
        let response = await fetch(serverURL + "archers");
        if (!response.ok) { throw await response.json(); }
        this.allArchers = await response.json();

        this.allArchers.sort((a, b) => (a.coach > b.coach));
      }
      catch (err) {
        console.err( err );
      }
    },

  },

});
