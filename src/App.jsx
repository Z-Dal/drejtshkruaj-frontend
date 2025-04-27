import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import ReactQuill, { Quill } from "react-quill";
import "react-quill/dist/quill.snow.css"; // Import Quill's styles
import "./App.css"
import registerQuillDrejtshkruaj from "./quill/quillDrejtshkruaj"; // Correct import path
import { AuthProvider } from "./auth/AuthContext";
import SimpleLogin from "./SimpleLogin"; // Main login component
import LoginPage from "./components/auth/LoginPage"; // Original login using AuthContext
import AuthDebug from "./components/auth/AuthDebug";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import MainLayout from "./components/layout/MainLayout";
import { addTokenWidgetToEditor } from "./components/profile/EditorTokenWidget";

// Only import debug components when needed
// import DirectLogin from "./debug/DirectLogin";
// import LoginTest from "./debug/LoginTest";
// import SimplestLoginForm from "./debug/SimplestLoginForm";

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
          {/* Main Routes */}
          <Route path="/login" element={<SimpleLogin />} />
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
          
          {/* Debug Route - Keep only the essential ones */}
          <Route path="/debug/auth" element={<AuthDebug />} />
          <Route path="/debug/login-old" element={<LoginPage />} />
          
          {/* Uncomment these if you need to test with them again
          <Route path="/debug/login-direct" element={<DirectLogin />} />
          <Route path="/debug/login-test" element={<LoginTest />} />
          <Route path="/debug/login-simple" element={<SimplestLoginForm />} />
          */}
          
          {/* Fallback Route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
