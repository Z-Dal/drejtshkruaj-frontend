import React, { useState } from "react";
import ReactQuill, { Quill } from "react-quill";
import "react-quill/dist/quill.snow.css"; // Import Quill's styles
import "./App.css"
import registerQuillDrejtshkruaj from "./quill/quillDrejtshkruaj"; // Correct import path


registerQuillDrejtshkruaj(Quill);


const modules = {
  Drejtshkruaj: {
    apiOptions: {
      level: "picky",
    },
  },
};

function App() {
  const [value, setValue] = useState("");
  return (
    <>
    <div class="appCss">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={setValue}
        modules={modules}
      />
      </div>
    </>
  );
}

export default App;
