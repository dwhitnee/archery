/*jslint node: true, esversion: 8 */
//----------------------------------------------------------------------
// Generic Internal DynamoDB functions, not the API
//
// Expects tableName to be passed to all fucntions,
//
// Uses Get() - requires a hash key
// Query() - requires hash and range key (or secondary Global Index)
// Scan() - requires only a filter

// Delete and Update require hash keys
//----------------------------------------------------------------------

// AWS SDK 2
// let AWS = require('aws-sdk');
// let dynamoDB = new AWS.DynamoDB.DocumentClient();

// AWS SDK 3
// import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
// import { DynamoDBDocument, QueryCommand, ScanCommand,
//          GetCommand, PutCommand, UpdateCommand, DeleteCommand }
//        from "@aws-sdk/lib-dynamodb";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocument, QueryCommand, ScanCommand,
         GetCommand, PutCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const dynamoDB = DynamoDBDocument.from(new DynamoDBClient());

module.exports = {

  //----------------------------------------
  // get one data blob by single key
  //
  // @param tableName - DB tableName
  // @param id - the PK (hash key)
  //----------------------------------------
  getRecordById: async function( tableName, id ) {
    let keys = {"id": id };
    return await this.getRecordByKeys( tableName, keys);
  },

  // return one value given the (possibly compound: Hash key + sort key) keys
  getRecordByKeys: async function( tableName, keys ) {
    console.log("Getting " + tableName + ": " + JSON.stringify( keys ));

    let dbRequest = {
      TableName : tableName,
      Key: keys
    };

    console.log( dbRequest );

    const response = await dynamoDB.send( new GetCommand( dbRequest ));
    console.log( response );
    return response.Item || {};    // no data returns undefined, not an empty Item object
  },


  //----------------------------------------------------------------------
  // Retrieve a list of records from DB
  // This is intended to be wrapped and called internally
  //
  // arg ":values" represent variables, without colon is key name (unless reserved)
  // NOTE: "year" is reserved"

  // @param tableName - DB table
  // @param query - ex: "id = :id and year = :year";
  // @param args for query - ex: { ':id': 'id', ':year': year };
  //----------------------------------------------------------------------
  getRecordsByQuery: async function( tableName, query, args, argNames ) {
    console.log("Querying " + tableName + ": " + JSON.stringify( args ));

    let dbRequest = {
      TableName : tableName,
      KeyConditionExpression: query,
      ExpressionAttributeValues: args,
      ExpressionAttributeNames: argNames  // only required if an arg is a reserved word (like 'year')
    };
    console.log( dbRequest );

    const response = await dynamoDB.send( new QueryCommand( dbRequest ));
    console.log( response );
    return response.Items || [];   // no data returns undefined, not an empty Item object
  },


  //----------------------------------------------------------------------
  // Retrieve a list of records from DB
  // This is intended to be wrapped and called internally
  // https://dynobase.dev/dynamodb-filterexpression/
  //
  // arg ":values" represent variable values, without colon is key name (unless reserved)
  // arg "#var" is used in functions as named variables, ex:
  //  FilterExpression : "contains(#name, :name) AND #projectId = :projectId
  // This helps with naming conflicts and reserved words

  // @param tableName - DB table
  // @param filter - ex: "id = :id and year = :year";
  // @param argNames for filter - ex: { "#coach": "coach" }   only needed for filter funcs
  // @param args for filter - ex: { ':id': 'id', ':year': year };
  //----------------------------------------------------------------------
  getRecordsByFilter: async function( tableName, filter, args, argNames ) {
    console.log("Querying " + tableName + ": " + args);

    let dbRequest = {
      TableName: tableName,
      FilterExpression: filter,
      ExpressionAttributeNames: argNames,
      ExpressionAttributeValues: args
    };

    console.log( dbRequest );

    const response = await dynamoDB.send( new ScanCommand( dbRequest ));
    console.log( response );
    return response.Items || [];
  },

  //----------------------------------------------------------------------
  // Full table scan - SELECT * from tableName
  //----------------------------------------------------------------------
  getAllRecords: async function( tableName ) {
    console.log("Querying " + tableName );

    let dbRequest = {
      TableName: tableName,
    };

    const response = await dynamoDB.send( new ScanCommand( dbRequest ));
    console.log( response );
    return response.Items || [];

    // response.Items.forEach(function (pie) {
    //   console.log(`${pieS}\n`);
    // });
  },



  //----------------------------------------------------------------------
  // return all records based on Secondary Global Index created manually
  // Same as getRecordsByQuery otherwise
  //
  // @param tableName - DB table
  // @param tableName - indexName (must be created in Dynamo)
  // @param query - ex: "coach = :coach and year = :year";
  // @param args for query - ex: { ':coach': 'coach', ':year': year };
  //----------------------------------------------------------------------
  getRecordsBySecondaryIndex: async function( tableName, indexName, query, args ) {

    // let someTime = new Date();
    // someTime.setDate( someTime.getDate()-1);
    // let yesterday = someTime.toISOString();   // "2020-05-05T09:46:26.500Z"

    // // SQL equivalent: "SELECT * from Games WHERE createdDate> "Thu Jan 18 2018"

    // // The Index allows us to do this "where" clause.
    // // Since this is "NoSQL" this query is impossible without this
    // // Index configured on the table ahead of time.

    // // The alternative is to scan() all Games and only show the days we want.
    // // Or put a secondary/sort index on "day".

    // // :values represent variables, without colon is key name (unless reserved)

    let dbRequest = {
      TableName : tableName,
      IndexName: indexName, // "createdDate-index",
      KeyConditionExpression: query, //  "gameOver = :f and createdDate > :yesterday",
      ExpressionAttributeValues: args,
      // {
      //   ":yesterday": yesterday,       // "2020-05-04T09:46:26.500Z"
      //   ":f": "false"
      // }
    };

    console.log( dbRequest );

    const response = await dynamoDB.send( new QueryCommand( dbRequest ));
    console.log( response );
    return response.Items || [];   // no data returns undefined, not an empty Item object
  },


  //----------------------------------------
  // Some action occured, let's store the effect in DynamoDB
  // Optimistically lock on a versionId.  Fail if conflict
  //
  // @param: tableName - DB table
  // @param: id - PK
  // @param: data - blob to save
  //----------------------------------------
  saveRecord: async function( tableName, data ) {
    let now = new Date();

    //----------------------------------------
    // Create storage record, add timestamp (add sourceIp?)
    //----------------------------------------
    let dbParams = {
      TableName : tableName,
      Item: data,  // PK in data for PUT
    };

    dbParams.Item.updatedDate = now.toISOString();

    // console.log("Expecting to update v" + data.version);

    // optimistic locking  TEST ME
    // Make sure version # has not been incremented since last read
    if (data.version) {
      dbParams.ConditionExpression = "version = :oldVersion";
      dbParams.ExpressionAttributeValues = {
        ":oldVersion" : data.version
      };
      data.version++;   // write new version of data
    } else {
      data.version = 1;   // first write
    }

    if (!dbParams.Item.createdDate) {
      dbParams.Item.createdDate = now.toISOString();  // can't update a key
    }

    console.log("PUT request: " +  JSON.stringify( dbParams ));

    const response = await dynamoDB.send( new PutCommand( dbParams ));

    // console.log("Responding with updated data: " +  JSON.stringify( response.Attributes ));
    // return response.Attributes;   // empty without "ReturnValues"

    // with Update (vs Put)
    return dbParams.Item;  // NOT response.Item, response is always empty (need ReturnValues)
  },

  //----------------------------------------
  // Some action occured, let's store the effect in DynamoDB
  // Optimistically lock on a versionId.  Fail if conflict
  // This doesn't really work, need to pass in UpdateExpression, etc
  //
  // @param: tableName - DB table
  // @param: id - PK
  // @param: data - blob to save
  //----------------------------------------
  updateRecord: async function( tableName, data, dataType ) {
    let now = new Date();

    //----------------------------------------
    // Create storage record, add timestamp (add sourceIp?)
    //----------------------------------------
    let dbParams = {
      TableName : tableName,
      Key: data.id,  // pk for UPDATE
      ReturnValues: "ALL_NEW",   // allow us to return the newly updated object
      UpdateExpression: "SET #dataType = :data, updatedDate = :updatedDate",
      ExpressionAttributeNames: {
        "#dataType": dataType,
      },
      ExpressionAttributeValues: {
        ":data": data[dataType],
        ":updatedDate": now.toISOString()
      }
    };

    // iterate over all keys in object to update them all
    // https://dev.to/dvddpl/dynamodb-dynamic-method-to-insert-or-edit-an-item-5fnh

    // console.log("Expecting to update v" + data.version);

    // optimistic locking  TEST ME
    // Make sure version # has not been incremented since last read
    if (data.version) {
      dbParams.ConditionExpression = "version = :oldVersion";
      dbParams.ExpressionAttributeValues = {
        ":oldVersion" : data.version
      };
      data.version++;   // write new version of data
    } else {
      data.version = 1;   // first write
    }

    // huh?
    // if (!data.createdDate) {
    //   dbParams.Item.createdDate = now.toISOString();  // can't update keys
    // }

    console.log("UPDATE request: " +  JSON.stringify( dbParams ));

    // Put vs Update, we don't want to clobber old entry (do we?). Just add keys
    const response = await dynamoDB.send( new UpdateCommand( dbParams ));

    console.log("Responding with updated data: " +  JSON.stringify( response ));
    return response.Attributes;   // empty without "ReturnValues"

    // with Update (vs Put)
    // return dbParams.Item;  // NOT response.Item, response is always empty (need ReturnValues)
  },


  //----------------------------------------
  // Wipe record out
  // @params tableName - DB table
  // @params id - PK
  //----------------------------------------
  deleteRecord: async function( tableName, id ) {
    console.log("Permanently Deleting " + id );

    let dbRequest = {
      TableName : tableName,
      Key: {"id": id }};

    const response = await dynamoDB.send( new DeleteCommand( dbRequest ));
    console.log( response );
    return response;
  },

  deleteRecordByKeys: async function( tableName, keys ) {
    console.log("Permanently Deleting " + JSON.stringify( keys ) );

    let dbRequest = {
      TableName : tableName,
      Key: keys
    };

    const response = await dynamoDB.send( new DeleteCommand( dbRequest ));
    console.log( response );
    return response;
  },

  // can I update IFF version = V
/*
  updateGameData: function() {
    response = dynamodb.update_item(
      TableName="euchreGames",
      Key={
        'gameId':{'S': "abdefg"}
      },
      UpdateExpression='SET version = version + :inc',
      ExpressionAttributeValues = {
        ':inc': {'N': '1'}
      },
      ReturnValues="UPDATED_NEW"
  }
*/



};



// All reserved words: https://dynobase.dev/dynamodb-reserved-words/

// abort, absolute, action, add, after, agent, aggregate, all, allocate, alter, analyze, and, any, archive, are, array, as, asc, ascii, asensitive, assertion, asymmetric, at, atomic, attach, attribute, auth, authorization, authorize, auto, avg, back, backup, base, batch, before, begin, between, bigint, binary, bit, blob, block, boolean, both, breadth, bucket, bulk, by, byte, call, called, calling, capacity, cascade, cascaded, case, cast, catalog, char, character, check, class, clob, close, cluster, clustered, clustering, clusters, coalesce, collate, collation, collection, column, columns, combine, comment, commit, compact, compile, compress, condition, conflict, connect, connection, consistency, consistent, constraint, constraints, constructor, consumed, continue, convert, copy, corresponding, count, counter, create, cross, cube, current, cursor, cycle, data, database, date, datetime, day, deallocate, dec, decimal, declare, default, deferrable, deferred, define, defined, definition, delete, delimited, depth, deref, desc, describe, descriptor, detach, deterministic, diagnostics, directories, disable, disconnect, distinct, distribute, do, domain, double, drop, dump, duration, dynamic, each, element, else, elseif, empty, enable, end, equal, equals, error, escape, escaped, eval, evaluate, exceeded, except, exception, exceptions, exclusive, exec, execute, exists, exit, explain, explode, export, expression, extended, external, extract, fail, false, family, fetch, fields, file, filter, filtering, final, finish, first, fixed, flattern, float, for, force, foreign, format, forward, found, free, from, full, function, functions, general, generate, get, glob, global, go, goto, grant, greater, group, grouping, handler, hash, have, having, heap, hidden, hold, hour, identified, identity, if, ignore, immediate, import, in, including, inclusive, increment, incremental, index, indexed, indexes, indicator, infinite, initially, inline, inner, innter, inout, input, insensitive, insert, instead, int, integer, intersect, interval, into, invalidate, is, isolation, item, items, iterate, join, key, keys, lag, language, large, last, lateral, lead, leading, leave, left, length, less, level, like, limit, limited, lines, list, load, local, localtime, localtimestamp, location, locator, lock, locks, log, loged, long, loop, lower, map, match, materialized, max, maxlen, member, merge, method, metrics, min, minus, minute, missing, mod, mode, modifies, modify, module, month, multi, multiset, name, names, national, natural, nchar, nclob, new, next, no, none, not, null, nullif, number, numeric, object, of, offline, offset, old, on, online, only, opaque, open, operator, option, or, order, ordinality, other, others, out, outer, output, over, overlaps, override, owner, pad, parallel, parameter, parameters, partial, partition, partitioned, partitions, path, percent, percentile, permission, permissions, pipe, pipelined, plan, pool, position, precision, prepare, preserve, primary, prior, private, privileges, procedure, processed, project, projection, property, provisioning, public, put, query, quit, quorum, raise, random, range, rank, raw, read, reads, real, rebuild, record, recursive, reduce, ref, reference, references, referencing, regexp, region, reindex, relative, release, remainder, rename, repeat, replace, request, reset, resignal, resource, response, restore, restrict, result, return, returning, returns, reverse, revoke, right, role, roles, rollback, rollup, routine, row, rows, rule, rules, sample, satisfies, save, savepoint, scan, schema, scope, scroll, search, second, section, segment, segments, select, self, semi, sensitive, separate, sequence, serializable, session, set, sets, shard, share, shared, short, show, signal, similar, size, skewed, smallint, snapshot, some, source, space, spaces, sparse, specific, specifictype, split, sql, sqlcode, sqlerror, sqlexception, sqlstate, sqlwarning, start, state, static, status, storage, store, stored, stream, string, struct, style, sub, submultiset, subpartition, substring, subtype, sum, super, symmetric, synonym, system, table, tablesample, temp, temporary, terminated, text, than, then, throughput, time, timestamp, timezone, tinyint, to, token, total, touch, trailing, transaction, transform, translate, translation, treat, trigger, trim, true, truncate, ttl, tuple, type, under, undo, union, unique, unit, unknown, unlogged, unnest, unprocessed, unsigned, until, update, upper, url, usage, use, user, users, using, uuid, vacuum, value, valued, values, varchar, variable, variance, varint, varying, view, views, virtual, void, wait, when, whenever, where, while, window, with, within, without, work, wrapped, write, year, zone
