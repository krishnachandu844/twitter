const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const path = require("path");
const databasePath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDbServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Started Running");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDbServer();

//GETTING USER FOLLOWING PEOPLE ID'S

const getFollowingPeopleIDsOfUser = async (username) => {
  const getFollowingPeopleQuery = `select following_user_id from follower
    inner join user on user.user_id=follower.follower_user_id
    where user.username='${username}';`;
  const followingPeople = await db.all(getFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  return arrayOfIds;
};

//AUTHENTICATION//
const authorization = async (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

// REGISTER API//
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `select * from user where username='${username}';`;
  const dbResponse = await db.get(getUserQuery);
  if (dbResponse === undefined) {
    const passwordLength = password.length;

    if (passwordLength > 6) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `insert into user(username,password,name,gender)
          values('${username}','${hashedPassword}','${name}','${gender}');`;
      const userResponse = await db.run(addUserQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//LOGIN API//
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
    select * from user where username='${username}';`;
  const userResponse = await db.get(getUserQuery);
  if (userResponse === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userResponse.password
    );
    if (isPasswordMatched) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//user/tweets/feed//
app.get("/user/tweets/feed/", authorization, async (request, response) => {
  let { username } = request;
  const getUser = `select * from user where username='${username}';`;
  const userDetails = await db.get(getUser);
  const { user_id } = userDetails;
  const getTweetsFeedQuery = `
    select 
        username,
        tweet,
        date_time AS dateTime
    FROM 
        follower inner join tweet on follower.following_user_id=tweet.user_id
        inner join user on user.user_id=follower.following_user_id
    where 
        follower.follower_user_id=${user_id}
    order by 
        date_time DESC
    LIMIT 4;`;
  const tweetFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});

//API-4

app.get("/user/following/", authorization, async (request, response) => {
  const { username } = request;
  const getUser = `select * from user where username='${username}';`;
  const userDetails = await db.get(getUser);
  const { user_id } = userDetails;
  const getFollowingUsersQuery = `
    select name 
    from user inner join follower on user.user_id=follower.following_user_id
    where 
    follower.follower_user_id='${user_id}';`;

  const followingPeople = await db.all(getFollowingUsersQuery);
  response.send(followingPeople);
});

//API 5

app.get("/user/followers", authorization, async (request, response) => {
  const { username } = request;
  const getUser = `select * from user where username='${username}';`;
  const userDetails = await db.get(getUser);
  const { user_id } = userDetails;

  const userFollowerQuery = `
    select 
        name
    from
        user inner join follower on user.user_id=follower.follower_user_id
        
    where
        follower.following_user_id=${user_id};`;
  const userFollowingArray = await db.all(userFollowerQuery);
  response.send(userFollowingArray);
});

//API 6
app.get("/tweets/:tweetId", authorization, async (request, response) => {
  const { tweetId } = request;
  const { username } = request;
  const getUser = `select * from user where username='${username}';`;
  const userDetails = await db.get(getUser);
  const { user_id } = userDetails;
  const tweetsQuery = `select * from tweet where tweet_id=${tweetId};`;
  const tweetResult = await db.get(tweetsQuery);

  const userFollowerQuery = `
    select
        *
    from
        follower inner join user on user.user_id=follower.following_user_id
    where
        follower.follower_user_id=${user_id};`;
  const userFollowers = await db.all(userFollowerQuery);
  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    console.log(tweetResult);
    console.log("----------");
    console.log(userFollowers);
    const getTweetDetailsQuery = `
        select
            tweet,
            count(distinct(like.like_id)) as likes,
            count(distinct(reply.reply_id)) as replies,
            tweet.date_time as dateTime
        From
            tweet inner join like on tweet.tweet_id=like.tweet_id inner join reply on reply.tweet_id=tweet.tweet_id
            
        where
            tweet.tweet_id=${tweetId} and tweet.user_id=${userFollowers[0].user_id};`;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7
app.get("/tweets/:tweetId/likes", authorization, async (request, response) => {
  const { tweetId } = request;
  const { username } = request;
  const getUser = `select * from user where username='${username}';`;
  const userDetails = await db.get(getUser);
  const { user_id } = userDetails;

  const getLikedUsersQuery = `
    select
        *
    from
        follower inner join tweet on tweet.user_id=follower.following_user_id 
        inner join like on like.tweet_id=tweet.tweet_id inner join user on user.user_id=like.user_id
    where
        tweet.tweet_id=${tweetId} and follower.follower_user_id=${user_id};`;
  const likedUsers = await db.all(getLikedUsersQuery);
  console.log(likedUsers);
  if (likedUsers.length !== 0) {
    let likes = [];
    const getNamesArray = (likedUsers) => {
      for (let item of likedUsers) {
        likes.push(item.username);
      }
    };
    getNamesArray(likedUsers);
    response.send({ likes });
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 8
app.get(
  "/tweets/:tweetId/replies",
  authorization,
  async (request, response) => {
    const { tweetId } = request;
    const { username } = request;
    const getUser = `select * from user where username='${username}';`;
    console.log(getUser);
    const userDetails = await db.get(getUser);
    const { user_id } = userDetails;
    console.log(user_id);

    const getRepliedUsersQuery = `
    select
        *
    from
        follower inner join tweet on tweet.user_id=follower.following_user_id 
        inner join reply on reply.tweet_id=tweet.tweet_id inner join user on user.user_id=reply.user_id
    where
        tweet.tweet_id=${tweetId} and follower.follower_user_id=${user_id};`;
    const repliedUsers = await db.all(getRepliedUsersQuery);
    console.log(repliedUsers);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.sens("Invalid Request");
    }
  }
);

//API 9//

app.get("/user/tweets/", authorization, async (request, response) => {
  const { username } = request;
  const getUser = `select * from user where username='${username}';`;
  const userDetails = await db.get(getUser);
  const { user_id } = userDetails;
  const getTweetsDetailsQuery = `
    select
        tweet.tweet as tweet,
        count(distinct(like.like_id)) as likes,
        count(distinct(reply.reply_id)) as replies,
        tweet.date_time as dateTime
    from
        user inner join tweet on user.user_id=tweet.user_id inner join like on like.tweet_id=tweet.tweet_id
        inner join reply on reply.tweet_id=tweet.tweet_id
    where
        user.user_id=${user_id};
    group by
        tweet.tweet_id`;
  const tweetDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetDetails);
});

//API -10//

app.post("/user/tweets", authorization, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { username } = request;
  const getUser = `select * from user where username='${username}';`;
  console.log(getUser);
  const userDetails = await db.get(getUser);
  const { user_id } = userDetails;
  console.log(user_id);
  const postTwoQuery = `
    insert into
        tweet(tweet,user_id)
    values('${tweet}',${user_id});`;
  await db.run(postTwoQuery);
  response.send("Created a Tweet");
});

//DELETE API//

app.delete("/tweets/:tweetId/", authorization, async (request, response) => {
  const { tweetId } = request;
  const { username } = request;
  const getUser = `select * from user where username='${username}';`;
  const userDetails = await db.get(getUser);
  const { user_id } = userDetails;
  const selectedQuery = `select * from tweet where tweet.user_id=${user_id} and tweet.tweet_id=${tweetId};`;
  const tweetUser = await db.all(selectedQuery);
  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `delete from tweet where tweet.user_id=${user_id}
        AND tweet.tweet_id=${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
