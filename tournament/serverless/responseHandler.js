/*jslint node: true, esversion: 8 */
//----------------------------------------------------------------------
// All stuff related to responding to the HTTP Request
//----------------------------------------------------------------------

class InvalidRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.message = message;
    this.httpStatus = status;
    this.name = 'InvalidRequestError';
  }
}


// HTTP response for a successful call
let successResponse = {
  body: "RESPONSE GOES HERE - REPLACE ME",
  statusCode: 200,
  headers: {  // Allow any web page to call us (CORS support)
    "Access-Control-Allow-Origin": "*"
    // Access-Control-Allow-Credentials': true // only for auth/cookies
  }
};

// There is a bug/"feauture" in API Gateway that swallows these errors
let errorResponse = {
  error: { messageString: "huh? ATTACH REAL ERROR HERE" },
  statusCode: 400,
  messageString: "Doh! There was an error in the request OR MAYBE HERE"
};

//----------------------------------------------------------------------
// Take this data and shove it, back to the AWS user who requested it.
//----------------------------------------------------------------------
function respondWithSuccess( data, callback ) {
  let response = successResponse;
  response.body = JSON.stringify( data );  // prettify for transit
  console.info("Successful Response:");
  console.info( response.body );
  callback( null, response );
}


module.exports = {
  //----------------------------------------
  // check for required params, abort if not there
  //----------------------------------------
  verifyParam: function( request, param ) {
    let query = request.queryStringParameters;   // GET

    if (!query) {    // POST
      try {
        query = JSON.parse( request.body );
      } catch (e) {
        console.error( e.message + ":'" + request.body +"'" );
      }
    }

    // 0 is a valid param so can't do !query[param]
    if (!query || (param && (query[param]) === undefined)) {
      let errorMsg = "bad request/missing param: " + param;
      console.error( errorMsg );
      console.error( JSON.stringify( request ));

      // attach error message to response? How?

      // throw new Error( errorMsg );  // this doesn't work? WTF?
      // throw errorMsg;  // this should be caught as a 400

      throw new InvalidRequestError( errorMsg, 400 );
    }
    return true;
  },

  //----------------------------------------------------------------------
  // AWS response boilerplate - 200, CORS, etc...
  //----------------------------------------------------------------------
  respond: function( err, data, callback ) {
    if (err) {
      console.error("FAIL: " + JSON.stringify( err ));
      callback( err );
      // here's where the 400 needs to go
      // context.fail(JSON.stringify(response));
    } else {
      respondWithSuccess( data, callback );
    }
  },

  // utility wrapper to handle HTTP
  runFunctionAndRespond: async function( request, callback, command ) {
    try {
      let response = await command();
      this.respond( 0, response, callback );
    }
    catch( err ) {
      console.error("Run failed: " + JSON.stringify( err ));  // this does not show "message"?!
      this.respond( err.message, 0, callback );
      // how to differentiate between 500 and 400?  FIXME  API Gateway crap?

      // https://stackoverflow.com/questions/31329495/is-there-a-way-to-change-the-http-status-codes-returned-by-amazon-api-gateway
    }
  },

};
