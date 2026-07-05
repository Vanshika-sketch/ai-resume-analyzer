import { type FormEvent, useState } from "react";
import Navbar from "~/components/Navbar";
import FileUploader from "~/components/FileUploader";
import { usePuterStore } from "~/lib/puter";
import { useNavigate } from "react-router";
import { convertPdfToImage } from "~/lib/pdf2img";
import { generateUUID } from "~/lib/utils";
import { prepareInstructions, AIResponseFormat } from "~/constants";

export const meta = () => [
  { title: "Resumind | Upload" },
  { name: "description", content: "Upload your resume for AI analysis" },
];

const Upload = () => {
  const { auth, isLoading, fs, ai, kv } = usePuterStore();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const handleFileSelect = (file: File | null) => {
    setFile(file);
  };

  const handleAnalyze = async ({
    companyName,
    jobTitle,
    jobDescription,
    file,
  }: {
    companyName: string;
    jobTitle: string;
    jobDescription: string;
    file: File;
  }) => {
    setIsProcessing(true);

    try {
      setStatusText("Uploading the file...");
      const uploadedFile = await fs.upload([file]);
      if (!uploadedFile) return setStatusText("Error: Failed to upload file");

      setStatusText("Converting to image...");
      const imageFile = await convertPdfToImage(file);
      if (!imageFile.file)
        return setStatusText("Error: Failed to convert PDF to image");

      setStatusText("Uploading the image...");
      const uploadedImage = await fs.upload([imageFile.file]);
      if (!uploadedImage) return setStatusText("Error: Failed to upload image");

      setStatusText("Preparing data...");
      const uuid = generateUUID();
      const data = {
        id: uuid,
        resumePath: uploadedFile.path,
        imagePath: uploadedImage.path,
        companyName,
        jobTitle,
        jobDescription,
        feedback: "",
      };
      await kv.set(`resume:${uuid}`, JSON.stringify(data));

      setStatusText("Extracting text from resume...");
      const resumeText = await ai.img2txt(uploadedImage.path);
      if (!resumeText)
        return setStatusText("Error: Failed to extract text from resume");

      setStatusText("Analyzing...");
      const analysisPrompt = `
Here is the resume content:

${resumeText}

---

${prepareInstructions({ jobTitle, jobDescription, AIResponseFormat })}
`;

      const feedback = await ai.chat(analysisPrompt);
      if (!feedback) return setStatusText("Error: Failed to analyze resume");

      const feedbackText =
        typeof feedback.message.content === "string"
          ? feedback.message.content
          : feedback.message.content[0].text;

      data.feedback = JSON.parse(feedbackText);
      await kv.set(`resume:${uuid}`, JSON.stringify(data));
      setStatusText("Analysis complete, redirecting...");
      console.log(data);
      navigate(`/resume/${uuid}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An error occurred";
      console.error("Upload error:", err);
      setStatusText(`Error: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget.closest("form");
    if (!form) return;
    const formData = new FormData(form);

    const companyName = formData.get("company-name") as string;
    const jobTitle = formData.get("job-title") as string;
    const jobDescription = formData.get("job-description") as string;

    if (!file) return;
    handleAnalyze({ companyName, jobTitle, jobDescription, file });
  };

  return (
    <main className="bg-[url('/images/bg-main.svg')] bg-cover min-h-screen">
      <Navbar />

      <section className="main-section">
        <div className="page-heading py-16">
          <h1>Smart feedback for your dream job</h1>
          {isProcessing ? (
            <>
              <h2>{statusText}</h2>
              <img src="/images/resume-scan.gif" className="w-full" />
            </>
          ) : (
            <>
              <h2>Drop your resume and get AI-powered feedback</h2>
              <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-8">
                <div className="form-div">
                  <label className="font-semibold">Resume (PDF)</label>
                  <FileUploader onFileSelect={handleFileSelect} />
                </div>

                <div className="form-div">
                  <label htmlFor="company-name" className="font-semibold">
                    Company Name (Optional)
                  </label>
                  <input
                    id="company-name"
                    name="company-name"
                    type="text"
                    placeholder="e.g., Google"
                  />
                </div>

                <div className="form-div">
                  <label htmlFor="job-title" className="font-semibold">
                    Job Title (Optional)
                  </label>
                  <input
                    id="job-title"
                    name="job-title"
                    type="text"
                    placeholder="e.g., Frontend Developer"
                  />
                </div>

                <div className="form-div">
                  <label htmlFor="job-description" className="font-semibold">
                    Job Description (Optional)
                  </label>
                  <textarea
                    id="job-description"
                    name="job-description"
                    placeholder="Paste the job description here for more tailored feedback..."
                    rows={6}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!file || isProcessing}
                  className="primary-button disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isProcessing ? "Analyzing..." : "Analyze Resume"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default Upload;