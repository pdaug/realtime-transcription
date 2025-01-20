// variables and constants
let socket = null;
let recorder = null;
let audioChunks = [];

// elements
const sectionElement = document.querySelector("section");

// element buttons
const stopButton = document.querySelector("#stopButton");
const startButton = document.querySelector("#startButton");
const connectButton = document.querySelector("#connectButton");

// element inputs
const urlInput = document.querySelector("[name=inputOpenAIURL]");
const keyInput = document.querySelector("[name=inputOpenAIAPIKey]");
const modelInputs = document.querySelectorAll("[name=inputOpenAIModel]");

// values
let urlInputValue = inputOpenAIURL.value;
let keyInputValue = inputOpenAIAPIKey.value;
let modelInputsValue = "gpt-4o-mini-audio-preview-2024-12-17";

modelInputs.forEach(function (input) {
  input.addEventListener("change", function (event) {
    modelInputsValue = event.target.value;
    console.log("OpenAI Config", {
      openai_url: urlInputValue,
      openai_api_key: keyInputValue,
      openai_model: modelInputsValue,
    });
  });
});

// connect button clicked
connectButton.addEventListener("click", function () {
  socket = new WebSocket(
    `${urlInputValue}?model=${modelInputsValue}`, 
    [
      "realtime",
      `openai-insecure-api-key.${keyInputValue}`,
      "openai-beta.realtime-v1",
    ]
  );

  // socket open
  socket.addEventListener("open", function () {
    socket.send(
      JSON.stringify({
        event_id: "event_123",
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          instructions: "transcribe audio",
          input_audio_format: "pcm16",
          input_audio_transcription: {
            model: "whisper-1",
          },
        },
      })
    );
    socket.send(
      JSON.stringify({
        event_id: "event_123",
        type: "input_audio_buffer.clear",
      })
    );
    stopButton.disabled = true;
    startButton.disabled = false;
    connectButton.disabled = true;
    console.info("Socket Connected");
    return;
  });

  // socket receive message
  socket.addEventListener("message", function (event) {
    const data = JSON.parse(event.data);
    // socket receive message to transcription
    if (data.type === "conversation.item.input_audio_transcription.completed") {
      const transcribeLine = document.createElement("div");
      transcribeLine.innerText = data.transcript;
      sectionElement.append(transcribeLine);
    }
    console.log("Socket Message", data);
    return;
  });

  // socket close
  socket.addEventListener("close", function () {
    stopButton.disabled = true;
    startButton.disabled = true;
    connectButton.disabled = true;
    console.info("Socket Close");
    return;
  });

  // socket error
  socket.addEventListener("error", function (err) {
    stopButton.disabled = true;
    startButton.disabled = true;
    connectButton.disabled = true;
    console.info("Socket error", err);
    return;
  });
});

// start button clicked
startButton.addEventListener("click", async function () {
  audioChunks = [];
  sectionElement.innerHTML = "";
  
  try {
    const mediaDevicesConfig = {
      audio: {
        channelCount: 1,
        sampleRate: 24000,
      },
    };
    const audioContextConfig = { sampleRate: 24000 };
    const mediaRecorderConfig = { mimeType: "audio/webm;codecs=pcm" };

    const stream = await navigator.mediaDevices.getUserMedia(mediaDevicesConfig);
    const audioContext = new AudioContext(audioContextConfig);
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    recorder = new MediaRecorder(stream, mediaRecorderConfig);

    // audio on process
    processor.onaudioprocess = function (event) {
      const chunk = event.inputBuffer.getChannelData(0);
      audioChunks.push(chunk);
      const audioPCM = chunkToPCM(chunk);
      const audioBase64 = PCMToBase64(audioPCM);
      socket.send(
        JSON.stringify({
          event_id: "event_123",
          type: "input_audio_buffer.append",
          audio: audioBase64,
        })
      );
    };

    recorder.start();
    source.connect(processor);
    processor.connect(audioContext.destination);

    startButton.disabled = true;
    stopButton.disabled = false;
    console.info("Recorder Start");
    return;
  } catch (err) {
    console.error("Recorder Error", err);
    return;
  }
});

// stop button clicked
stopButton.addEventListener("click", function () {
  if (recorder && recorder.state === "recording") {
    socket.send(
      JSON.stringify({
        event_id: "event_123",
        type: "input_audio_buffer.commit",
      })
    );
    socket.send(
      JSON.stringify({
        event_id: "event_123",
        type: "response.create",
      })
    );
    recorder.stop();
    startButton.disabled = false;
    stopButton.disabled = true;
    socket.send(
      JSON.stringify({
        type: "input_audio_buffer.clear",
      })
    );
    console.info("Recorder End");
    return;
  }
  return;
});