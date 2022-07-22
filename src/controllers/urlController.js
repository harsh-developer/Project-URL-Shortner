const shortid = require("shortid");
const validurl = require("valid-url");
const urlModel = require("../models/urlModel");
const { get } = require("../routes/route");
const redis = require("redis");
const { promisify } = require("util");

//create connection to redis
const redisClient = redis.createClient(
  16043, //redis port
  "redis-16043.c212.ap-south-1-1.ec2.cloud.redislabs.com", //redis db url
  { no_ready_check: true }
);
redisClient.auth("0CPcalOmGTXLf80NWHNSH5tUS3p1jUo4", function (err) {  //redis db password
  if (err) throw err;
});
redisClient.on("connect", async function () { //build connection with redis db
  console.log("connected to redis");
});

//set Get and Set for cache
const SET_ASYNC = promisify(redisClient.SET).bind(redisClient);
const GET_ASYNC = promisify(redisClient.GET).bind(redisClient);

//Validation
const isValid = function (value) {
  if (typeof value == "undefined" || value == null) return false;
  if (typeof value == "string" && value.trim().length == 0) return false;
  if (typeof value == "number") return false;
  return true;
};

const isValidRequestBody = function (request) {
  return Object.keys(request).length > 0;
};

// url validation regex
let urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%.\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%\+.~#?&//=]*)/;

//======================================= Create Short Url ==========================================

const createShortUrl = async function (req, res) {
  try {
    //declare logUrl from request body
    const longUrl = req.body.longUrl;

    //decleare baseUrl
    const baseUrl = "http://localhost:3000/";

    //Empty body validation
    if (!isValidRequestBody) {
      return res.status(400).send({ status: false, message: "Please Enter Input in request body" });
    }

    //Long Url validation
    if (!isValid(longUrl)) {
      return res.status(400).send({ status: false, msg: "Please enter url" });
    }

    if (!urlRegex.test(longUrl)) {
      return res.status(400).send({ status: false, msg: `${longUrl}  is not in a valid url.` });
    }

    //long url is valid url or not checking validation
    if (!validurl.isUri(longUrl)) {
      return res.status(400).send({ status: false, message: "url invalid!" });
    }

    //check long url present in redis or not
    const cacheUrl = await GET_ASYNC(`${longUrl}`);
    const shortUrlPresent = await urlModel.findOne({ longUrl }).select({ shortUrl: 1, _id: 0 });
    if (cacheUrl) {
      return res.status(200).send({ status: true, msg: shortUrlPresent });
    }

    //Generate Url code
    const urlCode = shortid.generate().toLowerCase();

    //generated Url code prent in database or not
    const alreadyExistUrlCode = await urlModel.findOne({ urlCode: urlCode });
    if (alreadyExistUrlCode) {
      return res.send(400).send({ status: false, msg: `${urlCode} is already exist` });
    }

    //create short Url by adding baseurl and generated Url code
    let shortUrl = baseUrl + urlCode;

    //short Url present in database or not
    const completeUrlExist = await urlModel.findOne({ shortUrl: shortUrl });
    if (completeUrlExist) {
      return res.send(400).send({ status: false, msg: `${shortUrl} already exist` });
    }

    //decreale the response body
    let responsebody = {
      longUrl: longUrl,
      shortUrl: shortUrl,
      urlCode: urlCode,
    };

    //create url model in database
    await urlModel.create(responsebody);
    const data = await urlModel.findOne({ longUrl }).select({ _id: 0, createdAt: 0, updatedAt: 0, __v: 0 });
    //set data in redis
    await SET_ASYNC(`${longUrl}`, JSON.stringify(data));
    return res.status(201).send({ status: true, msg: "url successfully created", data: data });
  }
  catch (error) {
    return res.status(500).send({ status: false, msg: error.message });
  }
};


//======================================= Get Url Details ==========================================

const getUrlCodes = async function (req, res) {
  try {
    const urlCode = req.params.urlCode;

    //url code valid or not
    if (!shortid.isValid(urlCode)) {
      return res.status(400).send({ status: false, msg: `${urlCode} is invalid` });
    }

    // url code present in cache/redis or not
    const getShortUrl = await GET_ASYNC(`${urlCode}`);
    //if present redirect to long url
    if (getShortUrl) {
      //JSON.parse- parses a string and returns a object
      return res.status(302).redirect(JSON.parse(getShortUrl).longUrl);
    }
    else {
      //Database check
      const getUrl = await urlModel.findOne({ urlCode });
      if (!getUrl) {
        return res.status(404).send({ status: false, msg: "Url not found" });
      } else {
        //set url code in redis
        await SET_ASYNC(`${urlCode}`, JSON.stringify(getUrl));
        return res.status(302).redirect(getUrl.longUrl);
      }
    }
  } catch (err) {
    return res.status(500).send({ status: false, msg: err.message });
  }
};

module.exports.createShortUrl = createShortUrl;
module.exports.getUrlCodes = getUrlCodes;