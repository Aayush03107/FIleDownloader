import { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  Copy,
  UploadCloud,
  File as FileIcon,
  CheckCircle,
  Loader2,
  Share2,
  RefreshCcw,
  Hash,
  X,
  Type,
} from "lucide-react";

function Upload() {
  const [textInput, setTextInput] = useState("");
  const [textFileName, setTextFileName] = useState(""); // Custom file name for text
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");

  const [fileId, setFileId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [downloadLink, setDownloadLink] = useState("");

  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const [expiryTime, setExpiryTime] = useState(null);
  const [initialTime, setInitialTime] = useState(0);

  const [progress, setProgress] = useState(0);

  // Refs
  const abortControllerRef = useRef(null);
  const uploadMetaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Format file sizes clearly
  const formatSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    if (bytes < 1024) return `${bytes} Bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // 1. Restore state after refresh
  useEffect(() => {
    const saved = localStorage.getItem("uploadData");
    if (!saved) return;

    const data = JSON.parse(saved);

    if (data.uploading || Date.now() > data.expiry) {
      localStorage.removeItem("uploadData");
      return;
    }

    setFileId(data.id);
    setQrCode(data.qrCode);
    setDownloadLink(data.link);
    setExpiryTime(data.expiry);
    setInitialTime(data.initialTime);

    setReady(true);
  }, []);

  // 2. Background check to clear UI when file expires
  useEffect(() => {
    if (!expiryTime) return;

    const interval = setInterval(() => {
      if (Date.now() > expiryTime) {
        clearInterval(interval);
        localStorage.removeItem("uploadData");
        setReady(false);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [expiryTime]);

  const cancelUpload = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setStatus("Cleaning up...");
    setLoading(false);
    setProgress(0);

    if (uploadMetaRef.current) {
      try {
        await axios.post(
          "http://localhost:3000/cancel-upload",
          uploadMetaRef.current,
        );
      } catch (err) {
        console.error("Failed to clean up server data", err);
      }
    }

    setStatus("Upload cancelled");
    uploadMetaRef.current = null;
  };

  const handleUpload = async () => {
    let activeFile = file;

    // --- BULLETPROOF TEXT-TO-FILE CONVERSION ---
    if (!activeFile && textInput.trim()) {
      let finalName = textFileName.trim() || "shared-message.txt";
      if (!finalName.includes(".")) {
        finalName += ".txt";
      }

      const textBlob = new Blob([textInput], {
        type: "text/plain;charset=utf-8",
      });

      activeFile = new File([textBlob], finalName, {
        type: "text/plain",
        lastModified: Date.now(),
      });
    }

    if (!activeFile || !password) {
      setStatus("Please provide a file or text content, and a password.");
      return;
    }

    setLoading(true);
    setProgress(0);
    setStatus("Initializing...");

    abortControllerRef.current = new AbortController();
    const reqConfig = { signal: abortControllerRef.current.signal };

    try {
      const fileSizeMB = activeFile.size / (1024 * 1024);
      let expiry = fileSizeMB < 10 ? 3600 : 86400; // 3600s = 1 hr, 86400s = 1 day

      const res = await axios.post(
        "http://localhost:3000/geturl",
        {
          fileName: activeFile.name,
          fileType: activeFile.type,
          password: password,
          filesize: activeFile.size,
          expiry: expiry,
        },
        reqConfig,
      );

      const { strategy, uploadUrl, id, qrDataUrl, partsize, key } = res.data;

      uploadMetaRef.current = {
        id,
        key,
        uploadId: strategy === "multipart" ? uploadUrl : null,
        strategy,
      };

      let finalLink = `http://localhost:5173/download/${id}`;
      let expireTime = Date.now() + expiry * 1000;

      if (strategy === "single") {
        await axios.put(uploadUrl, activeFile, {
          ...reqConfig,
          headers: { "Content-Type": activeFile.type },
          onUploadProgress: (e) => {
            const percent = Math.round((e.loaded * 100) / e.total);
            setProgress(percent);
            setStatus(`Uploading... ${percent}%`);
          },
        });
      } else if (strategy === "multipart") {
        const uploadId = uploadUrl;
        const totalParts = Math.ceil(activeFile.size / partsize);

        const multiRes = await axios.post(
          "http://localhost:3000/multipart",
          { key, uploadId, parts: totalParts },
          reqConfig,
        );

        const urls = multiRes.data.urls;
        const uploadedParts = [];
        let totalBytesUploaded = 0;

        for (let i = 0; i < urls.length; i++) {
          const start = i * partsize;
          const end = Math.min(start + partsize, activeFile.size);
          const chunk = activeFile.slice(start, end);

          const chunkRes = await axios.put(urls[i], chunk, {
            ...reqConfig,
            onUploadProgress: (e) => {
              const currentOverallLoaded = totalBytesUploaded + e.loaded;
              const percent = Math.round(
                (currentOverallLoaded * 100) / activeFile.size,
              );
              setProgress(percent);
              setStatus(`Uploading part ${i + 1}/${totalParts}`);
            },
          });

          totalBytesUploaded += chunk.size;
          const etag = chunkRes.headers.etag || chunkRes.headers.ETag;
          uploadedParts.push({ PartNumber: i + 1, ETag: etag });
        }

        setStatus("Finalizing upload...");

        await axios.post(
          "http://localhost:3000/completeMultipart",
          { uploadId, key, parts: uploadedParts },
          reqConfig,
        );
      }

      setFileId(id);
      setQrCode(qrDataUrl);
      setDownloadLink(finalLink);
      setExpiryTime(expireTime);
      setInitialTime(expiry);

      localStorage.setItem(
        "uploadData",
        JSON.stringify({
          uploading: false,
          id,
          qrCode: qrDataUrl,
          link: finalLink,
          expiry: expireTime,
          initialTime: expiry,
        }),
      );

      setReady(true);
      setStatus("");
      uploadMetaRef.current = null;
    } catch (err) {
      if (axios.isCancel(err)) {
        console.log("Upload cancelled successfully");
      } else {
        console.error(err);
        setStatus("Upload failed. Try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(downloadLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const uploadAnother = () => {
    localStorage.removeItem("uploadData");
    setFile(null);
    setTextInput("");
    setTextFileName("");
    setPassword("");
    setFileId("");
    setQrCode("");
    setDownloadLink("");
    setReady(false);
    setStatus("");
    setProgress(0);
    setExpiryTime(null);
  };

  // Drag and drop handlers for the single box
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const expiryText = initialTime === 3600 ? "in 1 hour" : "in 1 day";
  const calculatedTextSize = formatSize(new Blob([textInput]).size);

  return (
    <div
      className="card"
      style={{
        maxWidth: "480px",
        margin: "40px auto",
        padding: "24px",
        background: "white",
        borderRadius: "16px",
        boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
      }}
    >
      {!ready ? (
        <>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div
              style={{
                background: "#e0e7ff",
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <UploadCloud size={28} color="#6366f1" />
            </div>
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: "700",
                color: "#1e293b",
                margin: 0,
              }}
            >
              Secure Upload
            </h2>
            <p style={{ color: "#64748b", margin: "4px 0 0" }}>
              Encrypted file & text sharing made simple
            </p>
          </div>

          {/* SINGLE UNIFIED INPUT BOX */}
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
              border: "2px dashed #e2e8f0",
              borderRadius: "12px",
              padding: "16px",
              background: "#fafafa",
              marginBottom: "20px",
              position: "relative",
            }}
          >
            {/* Hidden file input triggered by the button */}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files[0]) setFile(e.target.files[0]);
              }}
            />

            {file ? (
              // --- FILE SELECTED UI ---
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "16px 0",
                  position: "relative",
                }}
              >
                <button
                  onClick={() => setFile(null)}
                  style={{
                    position: "absolute",
                    top: "-8px",
                    right: "-8px",
                    background: "#ef4444",
                    color: "white",
                    border: "none",
                    borderRadius: "50%",
                    width: "28px",
                    height: "28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                  title="Remove File"
                >
                  <X size={16} />
                </button>
                <FileIcon size={48} color="#6366f1" />
                <p
                  style={{
                    fontWeight: "600",
                    color: "#1e293b",
                    margin: "8px 0 0",
                  }}
                >
                  {file.name}
                </p>
                <p style={{ fontSize: "0.85rem", color: "#64748b", margin: 0 }}>
                  {formatSize(file.size)}
                </p>
              </div>
            ) : (
              // --- TEXT OR BROWSE UI ---
              <div style={{ display: "flex", flexDirection: "column" }}>
                {textInput.length > 0 && (
                  <input
                    type="text"
                    placeholder="Optional text file name (e.g. secure.txt)"
                    value={textFileName}
                    onChange={(e) => setTextFileName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #e2e8f0",
                      marginBottom: "12px",
                      boxSizing: "border-box",
                      fontSize: "0.85rem",
                    }}
                  />
                )}
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Paste secure text, or drag & drop a file here..."
                  style={{
                    width: "100%",
                    minHeight: "100px",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    resize: "none",
                    fontSize: "0.95rem",
                    color: "#1e293b",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderTop: "1px solid #e2e8f0",
                    paddingTop: "12px",
                    marginTop: "8px",
                  }}
                >
                  <p
                    style={{ fontSize: "0.75rem", color: "#64748b", margin: 0 }}
                  >
                    {textInput.length > 0
                      ? `Estimated size: ${calculatedTextSize}`
                      : "Or select a file directly:"}
                  </p>
                  <button
                    onClick={() => fileInputRef.current.click()}
                    style={{
                      background: "white",
                      border: "1px solid #e2e8f0",
                      padding: "8px 14px",
                      borderRadius: "8px",
                      color: "#475569",
                      fontSize: "0.85rem",
                      fontWeight: "600",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    }}
                  >
                    <UploadCloud size={16} /> Browse
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: "600",
                color: "#475569",
                marginBottom: "8px",
              }}
            >
              Encryption Password
            </label>
            <input
              type="password"
              placeholder="Set a password to unlock"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            onClick={handleUpload}
            disabled={loading || !password || (!file && !textInput.trim())}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "8px",
              backgroundColor: "#6366f1",
              color: "white",
              border: "none",
              fontWeight: "600",
              cursor:
                loading || !password || (!file && !textInput.trim())
                  ? "not-allowed"
                  : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              opacity:
                loading || !password || (!file && !textInput.trim()) ? 0.7 : 1,
            }}
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <UploadCloud size={20} />
            )}
            {loading ? "Uploading..." : "Encrypt & Upload"}
          </button>

          {/* CANCEL BUTTON AND PROGRESS SECTION */}
          {loading && (
            <div style={{ marginTop: "24px" }}>
              <div
                style={{
                  padding: "16px",
                  background: "#f8fafc",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                  marginBottom: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                    fontSize: "0.9rem",
                    color: "#475569",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontWeight: "600",
                    }}
                  >
                    <Loader2
                      className="animate-spin"
                      size={16}
                      color="#6366f1"
                    />{" "}
                    {status}
                  </span>
                  <span style={{ color: "#6366f1", fontWeight: "800" }}>
                    {progress}%
                  </span>
                </div>
                <div
                  style={{
                    height: "8px",
                    background: "#e2e8f0",
                    borderRadius: "99px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      background:
                        "linear-gradient(90deg, #6366f1 0%, #a855f7 100%)",
                      transition: "width 0.4s ease-out",
                    }}
                  ></div>
                </div>
              </div>

              <button
                onClick={cancelUpload}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #ef4444",
                  background: "#fee2e2",
                  color: "#b91c1c",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Cancel Upload
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              background: "#dcfce7",
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <CheckCircle size={32} color="#22c55e" />
          </div>
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: "700",
              color: "#1e293b",
              marginBottom: "4px",
            }}
          >
            Upload Complete
          </h2>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              color: "#64748b",
              fontSize: "0.9rem",
              marginBottom: "20px",
            }}
          >
            <Hash size={14} /> ID:{" "}
            <span
              style={{
                fontWeight: "bold",
                color: "#6366f1",
                background: "#f1f5f9",
                padding: "2px 8px",
                borderRadius: "4px",
              }}
            >
              {fileId}
            </span>
          </div>

          <div
            style={{
              background: "#f8fafc",
              padding: "16px",
              borderRadius: "12px",
              border: "1px solid #e2e8f0",
              marginBottom: "24px",
            }}
          >
            <p
              style={{
                fontSize: "1rem",
                fontWeight: "600",
                color: "#475569",
                margin: "0",
              }}
            >
              Content expires {expiryText} automatically
            </p>
          </div>

          <div style={{ textAlign: "left", marginBottom: "24px" }}>
            <label
              style={{
                fontSize: "0.875rem",
                fontWeight: "600",
                color: "#475569",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "8px",
              }}
            >
              <Share2 size={16} /> Shareable Link
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <div
                style={{
                  flex: 1,
                  padding: "12px",
                  background: "#f1f5f9",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  color: "#1e293b",
                  border: "1px solid #e2e8f0",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {downloadLink}
              </div>
              <button
                onClick={copyLink}
                style={{
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                {copied ? (
                  <CheckCircle size={20} color="#22c55e" />
                ) : (
                  <Copy size={20} color="#64748b" />
                )}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "16px",
              justifyContent: "center",
              alignItems: "center",
              background: "#f8fafc",
              padding: "16px",
              borderRadius: "12px",
              marginBottom: "24px",
            }}
          >
            {qrCode && (
              <img
                src={qrCode}
                alt="QR Code"
                style={{
                  width: "90px",
                  height: "90px",
                  borderRadius: "8px",
                  border: "4px solid white",
                }}
              />
            )}
            <div style={{ textAlign: "left" }}>
              <p
                style={{
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "#1e293b",
                  margin: "0 0 4px 0",
                }}
              >
                Scan QR
              </p>
              <p style={{ fontSize: "0.75rem", color: "#64748b", margin: 0 }}>
                Access on mobile instantly.
              </p>
            </div>
          </div>

          <button
            onClick={uploadAnother}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "white",
              color: "#475569",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
            }}
          >
            <RefreshCcw size={18} /> Upload Another
          </button>
        </div>
      )}
    </div>
  );
}

export default Upload;
