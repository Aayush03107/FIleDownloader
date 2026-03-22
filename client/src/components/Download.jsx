import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { DownloadCloud, FileKey, Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";

function Download() {
  const { id } = useParams();

  const [fileId, setFileId] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-fill File ID from URL (when user opens link or QR)
  useEffect(() => {
    if (id) {
      setFileId(id);
    }
  }, [id]);

  const handleDownload = async () => {
    if (!fileId || !password) {
      toast.error("Please enter both File ID and password.");
      return;
    }

    setLoading(true);
    setStatus("Verifying credentials...");

    try {
      const res = await axios.post("http://localhost:3000/download", {
        id: fileId,
        password: password,
      });

      // create hidden anchor
      const link = document.createElement("a");
      link.href = res.data.downloadUrl;
      link.setAttribute("download", ""); // let browser decide filename
      document.body.appendChild(link);
      link.click();
      link.remove();

      // NOW React still stays on page 
      setStatus("File is Downloading!");
      toast.success("Download started!");
    } catch (err) {
      console.error(err);
      setStatus(" Verification failed.");
      if (err.response?.status === 429) {
        toast.error("Bandwidth or Rate limit exceeded!");
      } else {
        toast.error("Incorrect ID, password, or file expired.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        textAlign: "center",
        maxWidth: "420px",
        margin: "40px auto",
      }}
    >
      <div
        style={{
          background: "#e0e7ff",
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px",
        }}
      >
        <FileKey size={32} color="#6366f1" />
      </div>

      <h2 className="card-title">Secure Download</h2>

      <p className="card-subtitle">Enter your credentials to access the file</p>

      <div
        className="input-group"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginTop: "20px",
        }}
      >
        {/* File ID */}

        <input
          type="text"
          className="text-input"
          placeholder="Enter File ID"
          value={fileId}
          onChange={(e) => setFileId(e.target.value)}
        />

        {/* Password */}

        <input
          type="password"
          className="text-input"
          placeholder="Enter File Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleDownload()}
        />
      </div>

      <button
        className="btn-primary"
        onClick={handleDownload}
        disabled={loading || !fileId || !password}
        style={{
          marginTop: "20px",
          width: "100%",
        }}
      >
        {loading ? (
          <Loader2 className="animate-spin" size={20} />
        ) : (
          <DownloadCloud size={20} />
        )}

        {loading ? "Verifying..." : "Unlock & Download"}
      </button>

      {status && (
        <p
          style={{
            marginTop: "16px",
            fontSize: "0.9rem",
            color: status.includes("Incorrect") ? "#ef4444" : "#64748b",
          }}
        >
          {status}
        </p>
      )}
    </div>
  );
}

export default Download;
