const functions = require("firebase-functions");
const { db } = require("./util/admin");
const {
  getAllScreams,
  postOneScream,
  getScream,
  commentOnScream,
  likeOnScream,
  unlikeOnScream,
  deleteScream
} = require("./handlers/screams");
const {
  signup,
  login,
  uploadImage,
  addUserDetails,
  getAuthenticatedUser,
  getUserDetails,
  markNotificationRead
} = require("./handlers/users");
const app = require("express")();
const FBAuth = require("./util/fbAuth");
const firebaseConfig = require("./util/config");

const firebase = require("firebase");
firebase.initializeApp(firebaseConfig);

//Scream routes
app.get("/screams", getAllScreams);
//post one scream
//fbauth is an authentication middleware
//checks the user is the correct user
app.post("/scream", FBAuth, postOneScream);
app.get("/scream/:screamId", getScream);
app.delete("/scream/:screamId", FBAuth, deleteScream);
app.get("/scream/:screamId/like", FBAuth, likeOnScream);
app.get("/scream/:screamId/unlike", FBAuth, unlikeOnScream);
app.post("/scream/:screamId/comment", FBAuth, commentOnScream);

//users routes
//Signup route
app.post("/signup", signup);
//login route
app.post("/login", login);
//image upload
app.post("/user/image", FBAuth, uploadImage);
//user details
app.post("/user", FBAuth, addUserDetails);
//user authenticated?
app.get("/user", FBAuth, getAuthenticatedUser);
app.get("/user/:handle", getUserDetails);
app.post("/notifications", FBAuth, markNotificationRead);

exports.api = functions.region("asia-east2").https.onRequest(app);

exports.createNotificationOnLike = functions
  .region("asia-east2")
  .firestore.document("likes/{id}")
  .onCreate(snapshot => {
    return db
      .doc(`/screams/${snapshot.data().screamId}`)
      .get()
      .then(doc => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: "like",
            read: false,
            screamId: doc.id
          });
        }
      })
      .catch(err => {
        console.log(err);
      });
  });

exports.deleteNotificationOnUnLike = functions
  .region("asia-east2")
  .firestore.document("likes/{id}")
  .onDelete(snapshot => {
    return db
      .doc(`/notifications/${snapshot.id}`)
      .delete()
      .catch(err => {
        console.error(err);
        return;
      });
  });

exports.createNotificationOnComment = functions
  .region("asia-east2")
  .firestore.document("comments/{id}")
  .onCreate(snapshot => {
    return db
      .doc(`/screams/${snapshot.data().screamId}`)
      .get()
      .then(doc => {
        if (
          doc.exists &&
          doc.data().userHandle !== snapshot.data().userHandle
        ) {
          return db.doc(`/notifications/${snapshot.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: doc.data().userHandle,
            sender: snapshot.data().userHandle,
            type: "comment",
            read: false,
            screamId: doc.id
          });
        }
      })
      .catch(err => {
        console.log(err);
        return;
      });
  });

exports.onUserImageChange = functions
  .region("asia-east2")
  .firestore.document("/users/{userId}")
  .onUpdate(change => {
    if (change.before.data().imageUrl !== change.after.data().imageUrl) {
      let batch = db.batch();
      return db
        .collection("screams")
        .where("userHandle", "==", change.before.data().handle)
        .get()
        .then(data => {
          data.forEach(doc => {
            const scream = db.doc(`/screams/${doc.id}`);
            batch.update(scream, { userImage: change.after.data().imageUrl });
          });
          return db
            .collection("comments")
            .where("userHandle", "==", change.before.data().handle)
            .get();
        })
        .then(data => {
          data.forEach(doc => {
            const comment = db.doc(`/comments/${doc.id}`);
            batch.update(comment, { userImage: change.after.data().imageUrl });
          });
          return batch.commit();
        })
        .catch(err => {
          console.error(err);
        });
    }
  });

exports.onScreamDelete = functions
  .region("asia-east2")
  .firestore.document("/screams/{screamId}")
  .onDelete((snapshot, context) => {
    const screamId = context.params.screamId;
    const batch = db.batch();
    return db
      .collection("comments")
      .where("screamId", "==", screamId)
      .get()
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/comments/${doc.id}`));
        });
        return db
          .collection("likes")
          .where("screamId", "==", screamId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection("notifications")
          .where("screamId", "==", screamId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch(err => {
        console.error(err);
      });
  });
