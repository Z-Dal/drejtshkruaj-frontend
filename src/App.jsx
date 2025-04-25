import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ReactQuill, { Quill } from "react-quill";
import "react-quill/dist/quill.snow.css"; // Import Quill's styles
import "./App.css"
import registerQuillDrejtshkruaj from "./quill/quillDrejtshkruaj"; // Correct import path
import { AuthProvider } from "./auth/AuthContext";
import LoginPage from "./components/auth/LoginPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import MainLayout from "./components/layout/MainLayout";


registerQuillDrejtshkruaj(Quill);


const modules = {
  Drejtshkruaj: {
    apiOptions: {
      level: "picky",
    },
  },
};

const Editor = () => {
  const [value, setValue] = React.useState("");
  return (
    <div className="appCss">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={setValue}
        modules={modules}
      />
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Editor />
                </MainLayout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
