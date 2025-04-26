import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ReactQuill, { Quill } from "react-quill";
import "react-quill/dist/quill.snow.css"; // Import Quill's styles
import "./App.css"
import registerQuillDrejtshkruaj from "./quill/quillDrejtshkruaj"; // Correct import path
import { AuthProvider } from "./auth/AuthContext";
import LoginPage from "./components/auth/LoginPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import MainLayout from "./components/layout/MainLayout";
import { addTokenWidgetToEditor } from "./components/profile/EditorTokenWidget";


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
  
  useEffect(() => {
    // Add token widget to the editor after it's initialized
    // Use setTimeout to ensure the editor DOM is fully rendered
    const timer = setTimeout(() => {
      addTokenWidgetToEditor();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);
  
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
