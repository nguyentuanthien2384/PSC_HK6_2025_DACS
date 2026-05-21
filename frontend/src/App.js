import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import HomePage from "./container/Home/HomePage";
import LoginWebPage from "./container/Login/LoginWebPage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginWebPage />} />
      </Routes>
    </Router>
  );
}

export default App;
