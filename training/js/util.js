//----------------------------------------------------------------------
// Misc useful functions
//----------------------------------------------------------------------

Array.prototype.rotate = function(n) {
  return this.slice(n, this.length).concat(this.slice(0, n));
};

var Util = {

  sadface: "(╯°□°)╯︵ ┻━┻  ",

  random: function( max ) { return Math.floor(max * Math.random());  },

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
        let json = window.localStorage.getItem( key );
        try {
          return JSON.parse( json );
        }
        catch (e) {
          console.error("Loading data " + key + ": " + e );
        }
        return null;
  },
  saveData( key, value ) {
        try {
          window.localStorage.setItem( key, JSON.stringify( value ));
        }
        catch (e) {
          console.error("Saving data " + key + ": " + e );
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
  }
};
