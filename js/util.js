/* global URL, Blob */
/*jslint esversion: 8 */
//----------------------------------------------------------------------
// Misc useful functions
//----------------------------------------------------------------------

Array.prototype.rotate = function(n) {
  return this.slice(n, this.length).concat(this.slice(0, n));
};

var Util = {

  sadface: "(╯°□°)╯︵ ┻━┻  ",
  namespace: "",  // namespace added to all saveData/loadData calls

  random: function( max ) { return Math.floor(max * Math.random());  },

  setNamespace: function( ns ) {
    this.namespace = ns;
  },

  //----------------------------------------
  // Do HTTP whizbangery to post a JSON blob
  //----------------------------------------
  makeJsonPostParams: function( data ) {
    return {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      method: "POST",
      body: JSON.stringify( data )
    };
  },

  //----------------------------------------------------------------------
  // localstorage wrapper - handles marshalling/stringifying of everything
  // and maintains objectness of values stored in a string database
  // @return null if no value is stored (or an error)
  //----------------------------------------------------------------------
  loadData( key ) {
    let json = window.localStorage.getItem( Util.namespace + key );
    try {
      return JSON.parse( json );
    }
    catch (e) {
      console.error("Loading data " + Util.namespace + key + ": " + e );
    }
    return null;
  },
  saveData( key, value ) {
    try {
      window.localStorage.setItem( Util.namespace + key, JSON.stringify( value ));
    }
    catch (e) {
      console.error("Saving data " + Util.namespace + key + ": " + e );
    }
  },


  //----------------------------------------
  // cookies are raw key/value text mushed together with ;'s
  //----------------------------------------
  getCookie: function( key ) {
    let value = ('; '+document.cookie). // homogenize string
        split('; ' + key + '=').        // array of all pairs
        pop().                          // lose leading empty element
        split(';').                     // remove everything after the ";"
        shift();                        // get first element out of array

    if (!value) {
      return ""; }
    else {
      return JSON.parse( value );
    }
  },

  //----------------------------------------
  // if you don't set path to root,
  // you get different cookie spaces depending on URL
  //----------------------------------------
  setCookie: function( key, value ) {
    value = JSON.stringify( value );
    document.cookie = key+"="+value+"; path=/; max-age=99999999";
  },

  //----------------------------------------
  // make a comma seprarated pile of data from a 2-D array
  // Doesn't handle " character well, but all others work, including commas and UTF-8
  //----------------------------------------
  exportToCSV: function( rows, filename ) {

    // const rows = [
    //   ["name1", "city1", "here's a com,ma"],
    //   ["name2", "city2", "more info", 69, "♥️", "Ångström"]
    // ];

    // quote every value so cells can contain anything
    let csv = rows.map(row => "\"".concat(row.join("\",\"")).concat("\"")).join("\n");

    this.downloadCSV( csv, filename+".csv");
  },

  //----------------------------------------
  // force browser to download the data rather than just display it
  // link bypasses popup blockers that window.open would trigger
  //----------------------------------------
  downloadCSV: function( csv, filename ) {
    let blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    let url = URL.createObjectURL( blob );

    let link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename );
    link.click();
  }
};
