import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

const firebaseConfig = {
  // your config
  apiKey: "AIzaSyBhXTQlNS834me_dYZnFsGr221RXxKpWdw",
  authDomain: "webrtcsample-643a5.firebaseapp.com",
  projectId: "webrtcsample-643a5",
  storageBucket: "webrtcsample-643a5.appspot.com",
  messagingSenderId: "912952287568",
  appId: "1:912952287568:web:8f99b6904e18e5142ecc55",
  measurementId: "G-B9MS1MYGB8"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun.ekiga.net', 'stun:stun.ideasip.com'],
    },
  ],
  iceCandidatePoolSize: 1,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = "https://clever-malasada-12c33d.netlify.app/";
let remoteStream = "https://clever-malasada-12c33d.netlify.app/";
;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const Name = document.getElementById('name');

// 1. Setup media sources

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  callInput.value = callDoc.id;

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    if (event.candidate){
      var candidate = event.candidate.toJSON()
      candidate.name = Name.value
      console.log(candidate)
      offerCandidates.add(candidate);
    }
    
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
     snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        console.log("candidate ---->",candidate)
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const answerName =Name.value; 
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };
  
  // console.log("Getting CallDoc --->", )
  const callData = (await callDoc.get()).data();
  console.log(callData)
  const offerDescription = callData.offer;
  // console.log("Data offerDescription --->", )
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      console.log("changes----->",change.type);
      if (change.type === 'added') {
        let data = change.doc.data();
        // console.log(data)
        await pc.addIceCandidate(new RTCIceCandidate(data)).then((data) => { console.log('add ice candidate success! ',data) })
        .catch((error) => {console.log(error)});
        console.log("Added Ice candidate")
      }
    });
  });
};
