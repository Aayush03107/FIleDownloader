import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Navbar from "./components/Navbar";
import Upload from "./components/Upload";
import Download from "./components/Download";
import "./App.css"; // Make sure your CSS is imported!

function App() {
  return (
    <BrowserRouter>
    <Toaster position="top-right" reverseOrder={false} />
      <div className="app-layout">
        <Navbar />
        {/* main-content acts as the centering container */}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Upload />} />
            <Route path="/download" element={<Download />} />
            <Route path="/download/:id" element={<Download />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
