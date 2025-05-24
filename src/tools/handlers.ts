import { validatePath } from "../utils/file.js";
import { getVideoInfo, runFFmpegCommand } from "../utils/ffmpeg.js";
import { ensureDirectoryExists } from "../utils/file.js";
import { join } from "path";
import { existsSync, readdirSync, readFileSync, unlinkSync, renameSync, writeFileSync } from "fs";
import * as dotenv from "dotenv";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

// Load environment variables from .env file
dotenv.config();

// Initialize the Gemini API client
const apiKey = process.env.GOOGLE_API_KEY || "";
if (!apiKey) {
  console.warn("WARNING: GOOGLE_API_KEY is not set in the .env file. The Gemini API will not work properly.");
}
const genAI = new GoogleGenerativeAI(apiKey);

// Helper function to parse time strings
function parseTimeToSeconds(timeStr: string | number): number {
  if (timeStr === undefined || timeStr === null) {
    throw new Error("Time input cannot be undefined or null.");
  }

  const time = String(timeStr).trim(); // Ensure it's a string and trim whitespace

  if (time === "") {
    throw new Error("Time string cannot be empty after trimming.");
  }

  if (time.includes(':')) {
    const parts = time.split(':');
    let totalSeconds = 0;
    if (parts.length === 3) { // HH:MM:SS.mmm or HH:MM:SS
      totalSeconds += parseInt(parts[0], 10) * 3600; // hours
      totalSeconds += parseInt(parts[1], 10) * 60;   // minutes
      totalSeconds += parseFloat(parts[2]);          // seconds
    } else if (parts.length === 2) { // MM:SS.mmm or MM:SS
      totalSeconds += parseInt(parts[0], 10) * 60;   // minutes
      totalSeconds += parseFloat(parts[1]);          // seconds
    } else {
      throw new Error(`Invalid time format: "${timeStr}". Expected HH:MM:SS.mmm, MM:SS.mmm, or a number of seconds.`);
    }
    if (isNaN(totalSeconds)) {
      throw new Error(`Invalid time string: "${timeStr}" resulted in NaN after parsing time components.`);
    }
    return totalSeconds;
  } else {
    const parsedSeconds = parseFloat(time);
    if (isNaN(parsedSeconds)) {
      throw new Error(`Invalid time format: "${timeStr}". Expected HH:MM:SS.mmm, MM:SS.mmm, or a number of seconds.`);
    }
    return parsedSeconds;
  }
}

/**
 * Analyzes a video using the Gemini API and returns the response
 * @param videoPath Local path to the video file
 * @param prompt The prompt to send to the Gemini model
 * @returns The Gemini API response as a string
 */
async function analyzeVideoWithGemini(videoPath: string, prompt: string): Promise<string> {
  // Check API key first
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Gemini API key is not configured. Please add a valid GOOGLE_API_KEY to your .env file.");
  }
  
  try {
    // Validate the video path
    const validatedPath = validatePath(videoPath, true);
    console.log(`Analyzing video: ${validatedPath}`);
    
    // Get video info to check duration, format, etc.
    console.log(`Getting video information...`);
    const info = await getVideoInfo(validatedPath);
    const videoInfo = JSON.parse(info);
    const duration = parseFloat(videoInfo?.format?.duration || '0');
    
    console.log(`Video duration: ${duration}s`);
    
    // Read the video file data
    const videoData = readFileSync(validatedPath);
    console.log(`Video loaded successfully (${Math.round(videoData.length / (1024 * 1024))} MB)`);
    
    // Convert to base64
    const base64Video = videoData.toString('base64');
    
    // Get the video MIME type from the file info
    const mimeType = videoInfo?.format?.format_name?.includes('mp4') ? 'video/mp4' : 'video/mp4';
    
    // Use Gemini model that supports video analysis
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", // Use model that supports video
      generationConfig: {
        maxOutputTokens: 1024,
        temperature: 0.2,
      }
    });
    
    // Construct a prompt for video analysis
    const enhancedPrompt = 
      `This is a video that's ${duration.toFixed(1)} seconds long. ` +
      `${prompt} ` +
      `Provide a detailed description and analysis of the video content.`;
    
    console.log(`Sending full video to Gemini API...`);
    
    // Request the analysis with timeout handling
    const timeoutMs = 60000; // 60 seconds timeout for video analysis
    
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs/1000} seconds`)), timeoutMs);
      });
      
      // Race the API call against the timeout
      const result = await Promise.race([
        model.generateContent([
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Video,
            },
          },
          { text: enhancedPrompt },
        ]),
        timeoutPromise
      ]) as any;
      
      const response = await result.response;
      console.log('Gemini API response received successfully');
      
      return (
        `Video Analysis Results:\n\n` +
        `${response.text()}`
      );
    } catch (error: any) {
      if (error.message.includes("timed out")) {
        throw new Error("The Gemini API request timed out. Please try again or use a different video.");
      }
      throw error;
    }
  } catch (error: any) {
    console.error(`Gemini API error: ${error.message}`);
    
    // Provide more specific error messages
    if (error.message.includes("invalid argument") || error.message.includes("400 Bad Request")) {
      throw new Error(
        "Gemini API rejected the request. This could be due to:\n" +
        "1. The API key may be invalid or have insufficient permissions\n" +
        "2. The video format may not be supported or the file is too large\n" +
        "3. The video duration may exceed the model's limits\n" +
        "Try with a different video or check your API key configuration."
      );
    } else if (error.message.includes("timeout")) {
      throw new Error("The Gemini API request timed out. Try again later when the service might be less busy.");
    } else if (error.message.includes("File too large") || error.message.includes("exceeds maximum allowed size")) {
      throw new Error("The video file is too large to process. Try with a smaller video or compress the current one.");
    } else {
      throw new Error(`Failed to analyze video: ${error.message}`);
    }
  }
}

/**
 * Parses the Gemini API response to extract start and end timestamps
 * @param responseText The response from the Gemini API
 * @returns An array of { startTime, endTime } objects
 */
function extractTimestampsFromResponse(responseText: string): Array<{ startTime: string, endTime: string }> {
  const timestampRegex = /\b(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\b/g;
  const matches = responseText.match(timestampRegex);
  const timestamps: Array<{ startTime: string, endTime: string }> = [];

  if (matches && matches.length >= 2) {
    for (let i = 0; i < matches.length; i += 2) {
      if (i + 1 < matches.length) {
        timestamps.push({ startTime: matches[i], endTime: matches[i + 1] });
      }
    }
  }

  if (timestamps.length === 0) {
    throw new Error("No valid timestamps found in Gemini response");
  }

  return timestamps;
}

/**
 * Removes specified segments from a video using FFmpeg
 * @param inputPath Path to the input video
 * @param segments Array of segments to remove, each with startTime and endTime
 * @param outputPath Path for the output video
 */
async function removeSegments(inputPath: string, segments: Array<{ startTime: string, endTime: string }>, outputPath: string) {
  const tempFiles: string[] = [];
  try {
    // Sort segments by start time
    segments.sort((a, b) => parseTimeToSeconds(a.startTime) - parseTimeToSeconds(b.startTime));

    // Get video info as JSON
    const info = await getVideoInfo(inputPath);
    let videoInfo;
    try {
      videoInfo = JSON.parse(info);
    } catch (error) {
      throw new Error(`Failed to parse video info as JSON: ${error}`);
    }

    // Extract duration from the format section of the JSON
    const duration = videoInfo?.format?.duration;
    if (!duration) {
      throw new Error("Could not determine video duration from video info");
    }
    const totalDuration = parseTimeToSeconds(duration).toFixed(6); // Convert to seconds if needed

    // Create a list of parts to keep
    const partsToKeep: Array<{ start: string, end: string }> = [];
    let prevEnd = "00:00:00";

    for (const segment of segments) {
      if (parseTimeToSeconds(prevEnd) < parseTimeToSeconds(segment.startTime)) {
        partsToKeep.push({ start: prevEnd, end: segment.startTime });
      }
      prevEnd = segment.endTime;
    }

    if (parseTimeToSeconds(prevEnd) < parseTimeToSeconds(totalDuration)) {
      partsToKeep.push({ start: prevEnd, end: totalDuration });
    }

    // Extract each part to keep
    const partPaths: string[] = [];
    for (let i = 0; i < partsToKeep.length; i++) {
      const partPath = `temp_part_${i}.mp4`;
      tempFiles.push(partPath);
      const command = `-i "${inputPath}" -ss ${partsToKeep[i].start} -to ${partsToKeep[i].end} -c copy "${partPath}" -y`;
      await runFFmpegCommand(command);
      partPaths.push(partPath);
    }

    // Concatenate the parts
    if (partPaths.length > 0) {
      const concatListPath = "temp_concat_list.txt";
      tempFiles.push(concatListPath);
      const concatList = partPaths.map(path => `file '${path}'`).join("\n");
      writeFileSync(concatListPath, concatList);

      const concatCommand = `-f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}" -y`;
      await runFFmpegCommand(concatCommand);
    } else {
      throw new Error("No segments to keep; the entire video would be removed");
    }
  } finally {
    for (const tempFile of tempFiles) {
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
    }
  }
}

/**
 * Automatically keeps only the segment of a video where a specified event occurs
 * @param inputPath Path to the input video
 * @param eventDescription Description of the event to keep (e.g., "the goalkeeper saves the penalty kick")
 * @param outputPath Path for the output video
 */
async function removeEventSegments(inputPath: string, eventDescription: string, outputPath: string) {
  const validatedInputPath = validatePath(inputPath, true);
  const validatedOutputPath = validatePath(outputPath);
  await ensureDirectoryExists(validatedOutputPath);

  try {
    // Step 1: Analyze video with Gemini to get the timestamps of the event to KEEP
    const prompt = `Identify the segment in the video where the following event occurs: "${eventDescription}". Provide the start and end timestamps in HH:MM:SS format for this segment. If the event spans multiple segments, provide the timestamps for the primary occurrence.`;
    const geminiResponse = await analyzeVideoWithGemini(validatedInputPath, prompt);

    // Step 2: Extract timestamps of the event to keep
    const segmentsToKeep = extractTimestampsFromResponse(geminiResponse);
    if (segmentsToKeep.length !== 1) {
      throw new Error("Expected exactly one segment to keep, but found " + segmentsToKeep.length);
    }
    const segmentToKeep = segmentsToKeep[0];

    // Step 3: Get video info to determine total duration
    const info = await getVideoInfo(inputPath);
    let videoInfo;
    try {
      videoInfo = JSON.parse(info);
    } catch (error) {
      throw new Error(`Failed to parse video info as JSON: ${error}`);
    }
    const duration = videoInfo?.format?.duration;
    if (!duration) {
      throw new Error("Could not determine video duration from video info");
    }
    const totalDuration = parseTimeToSeconds(duration).toFixed(6);

    // Step 4: Create segments to remove (everything before and after the segment to keep)
    const segmentsToRemove: Array<{ startTime: string, endTime: string }> = [];
    if (parseTimeToSeconds("00:00:00") < parseTimeToSeconds(segmentToKeep.startTime)) {
      segmentsToRemove.push({ startTime: "00:00:00", endTime: segmentToKeep.startTime });
    }
    if (parseTimeToSeconds(segmentToKeep.endTime) < parseTimeToSeconds(totalDuration)) {
      segmentsToRemove.push({ startTime: segmentToKeep.endTime, endTime: totalDuration });
    }

    // Step 5: Remove the unwanted segments
    if (segmentsToRemove.length > 0) {
      await removeSegments(validatedInputPath, segmentsToRemove, validatedOutputPath);
    } else {
      // If no segments to remove, just copy the input to output
      const command = `-i "${validatedInputPath}" -c copy "${validatedOutputPath}" -y`;
      await runFFmpegCommand(command);
    }

    return `Successfully kept the segment for event "${eventDescription}" from ${inputPath}. Output saved to ${outputPath}`;
  } catch (error: any) {
    throw new Error(`Failed to process video: ${error.message}`);
  }
}

/**
 * Automatically removes segments of a video where a specified event occurs
 * @param inputPath Path to the input video
 * @param eventDescription Description of the event to remove (e.g., "the dog barks")
 * @param outputPath Path for the output video
 */
async function deleteEventSegments(inputPath: string, eventDescription: string, outputPath: string) {
  const validatedInputPath = validatePath(inputPath, true);
  let validatedOutputPath = validatePath(outputPath);

  // Check if outputPath is a directory (doesn't end with a file extension like .mp4)
  const pathIsDirectory = !validatedOutputPath.match(/\.(mp4|avi|mov|mkv|webm)$/i);
  if (pathIsDirectory) {
    // If it's a directory, append a default file name based on the input file name
    const inputFileName = validatedInputPath.split('\\').pop()?.replace(/\.[^/.]+$/, "") || "video";
    validatedOutputPath = join(validatedOutputPath, `${inputFileName}_edited.mp4`);
  }

  // Let ensureDirectoryExists handle the parent directory creation
  await ensureDirectoryExists(validatedOutputPath);

  try {
    // Step 1: Analyze video with Gemini to get the timestamps of the event to REMOVE
    const prompt = `Identify all segments in the video where the following event occurs: "${eventDescription}". Provide the start and end timestamps in HH:MM:SS format for each segment. If the event occurs multiple times, list all occurrences with their respective timestamps.`;
    const geminiResponse = await analyzeVideoWithGemini(validatedInputPath, prompt);

    // Step 2: Extract timestamps of the event to remove
    const segmentsToRemove = extractTimestampsFromResponse(geminiResponse);

    // Step 3: Remove the specified segments
    if (segmentsToRemove.length > 0) {
      await removeSegments(validatedInputPath, segmentsToRemove, validatedOutputPath);
    } else {
      // If no segments to remove, just copy the input to output
      const command = `-i "${validatedInputPath}" -c copy "${validatedOutputPath}" -y`;
      await runFFmpegCommand(command);
    }

    return `Successfully removed segments for event "${eventDescription}" from ${inputPath}. Output saved to ${validatedOutputPath}`;
  } catch (error: any) {
    throw new Error(`Failed to process video: ${error.message}`);
  }
}

/**
 * Handles all FFmpeg and Gemini tool requests
 */
export async function handleToolCall(toolName: string, args: any) {
  switch (toolName) {
    case "get_video_info": {
      const filePath = validatePath(String(args?.filePath), true);
      const info = await getVideoInfo(filePath);
      return {
        content: [{
          type: "text",
          text: info
        }]
      };
    }

    case "analyze_video": {
      const filePath = validatePath(String(args?.filePath), true);
      const prompt = args?.prompt ? String(args?.prompt) : "Describe the contents of this video in detail.";

      try {
        const analysisResult = await analyzeVideoWithGemini(filePath, prompt);
        return {
          content: [{
            type: "text",
            text: `Video analysis: ${analysisResult}`
          }]
        };
      } catch (error: any) {
        throw new Error(`Failed to analyze video: ${error.message}`);
      }
    }

    case "remove_event_segments": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const eventDescription = String(args?.eventDescription);
      const outputPath = validatePath(String(args?.outputPath));

      try {
        const result = await removeEventSegments(inputPath, eventDescription, outputPath);
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      } catch (error: any) {
        throw new Error(`Failed to remove event segments: ${error.message}`);
      }
    }

    case "delete_event_segments": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const eventDescription = String(args?.eventDescription);
      const outputPath = validatePath(String(args?.outputPath));

      try {
        const result = await deleteEventSegments(inputPath, eventDescription, outputPath);
        return {
          content: [{
            type: "text",
            text: result
          }]
        };
      } catch (error: any) {
        throw new Error(`Failed to delete event segments: ${error.message}`);
      }
    }

    case "convert_video": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      const options = String(args?.options || "");
      
      await ensureDirectoryExists(outputPath);
      const command = `-i "${inputPath}" ${options} "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Video conversion completed: ${inputPath} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "extract_audio": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      const format = String(args?.format || "mp3");
      
      await ensureDirectoryExists(outputPath);
      const command = `-i "${inputPath}" -vn -acodec ${format} "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Audio extraction completed: ${inputPath} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "create_video_from_images": {
      const inputPattern = String(args?.inputPattern);
      const outputPath = validatePath(String(args?.outputPath));
      const framerate = Number(args?.framerate || 25);
      const codec = String(args?.codec || "libx264");
      const pixelFormat = String(args?.pixelFormat || "yuv420p");
      const extraOptions = String(args?.extraOptions || "");
      
      if (!inputPattern) {
        throw new Error("Input pattern is required");
      }
      
      await ensureDirectoryExists(outputPath);
      const command = `-framerate ${framerate} -i "${inputPattern}" -c:v ${codec} -pix_fmt ${pixelFormat} ${extraOptions} "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Video creation completed: ${inputPattern} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "trim_video": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      const startTime = String(args?.startTime || "0");
      const duration = String(args?.duration || "");
      const endTime = String(args?.endTime || "");
      
      await ensureDirectoryExists(outputPath);
      
      // Approach 1: Accurate seeking with re-encoding (slower but more reliable)
      let command = ``;
      
      // Seeking before input for more accurate seeking
      command = `-ss ${startTime} -i "${inputPath}"`;
      
      // Add duration/endtime if specified
      if (duration) {
        command += ` -t ${duration}`;
      } else if (endTime) {
        command += ` -to ${endTime}`;
      }
      
      // Use re-encoding instead of stream copy for more reliable output
      // Use a reasonable preset and quality settings
      command += ` -c:v libx264 -preset medium -c:a aac "${outputPath}" -y`;
      
      console.log(`Running FFmpeg trim command: ${command}`);
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Video trimming completed: ${inputPath} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "add_watermark": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const watermarkPath = validatePath(String(args?.watermarkPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      const position = String(args?.position || "bottomright");
      const opacity = Number(args?.opacity || 0.5);
      
      await ensureDirectoryExists(outputPath);
      
      // Determine overlay position
      let overlayPosition = "";
      switch (position.toLowerCase()) {
        case "topleft":
          overlayPosition = "10:10";
          break;
        case "topright":
          overlayPosition = "W-w-10:10";
          break;
        case "bottomleft":
          overlayPosition = "10:H-h-10";
          break;
        case "center":
          overlayPosition = "(W-w)/2:(H-h)/2";
          break;
        case "bottomright":
        default:
          overlayPosition = "W-w-10:H-h-10";
          break;
      }
      
      const command = `-i "${inputPath}" -i "${watermarkPath}" -filter_complex "[1:v]format=rgba,colorchannelmixer=aa=${opacity}[watermark];[0:v][watermark]overlay=${overlayPosition}:format=auto,format=yuv420p" -codec:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Watermark added: ${inputPath} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "trim_audio": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      const startTime = String(args?.startTime || "0");
      const duration = String(args?.duration || "");
      const endTime = String(args?.endTime || "");
      const format = String(args?.format || "");
      
      await ensureDirectoryExists(outputPath);
      
      let command = `-i "${inputPath}" -ss ${startTime}`;
      if (duration) {
        command += ` -t ${duration}`;
      } else if (endTime) {
        command += ` -to ${endTime}`;
      }
      if (format) {
        command += ` -acodec ${format}`;
      } else {
        command += ` -acodec copy`;
      }
      command += ` "${outputPath}" -y`;
      
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Audio trimming completed: ${inputPath} → ${outputPath}\n\n${result}`
        }]
      };
    }

    case "extract_frames": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const outputDir = String(args?.outputDir || "output");
      const frameRate = String(args?.frameRate || "1");
      const format = String(args?.format || "jpg");
      const quality = Number(args?.quality || 95);
      const startTime = args?.startTime ? String(args?.startTime) : "";
      const duration = args?.duration ? String(args?.duration) : "";
      
      await ensureDirectoryExists(join(outputDir, "dummy.txt"));
      
      let command = `-i "${inputPath}"`;
      if (startTime) {
        command += ` -ss ${startTime}`;
      }
      if (duration) {
        command += ` -t ${duration}`;
      }
      command += ` -vf "fps=${frameRate}"`;
      
      if (format.toLowerCase() === "jpg" || format.toLowerCase() === "jpeg") {
        const ffmpegQuality = Math.max(1, Math.min(31, Math.round(31 - ((quality / 100) * 30))));
        command += ` -q:v ${ffmpegQuality}`;
      } else if (format.toLowerCase() === "png") {
        const compressionLevel = Math.min(9, Math.max(0, Math.round(9 - ((quality / 100) * 9))));
        command += ` -compression_level ${compressionLevel}`;
      }
      
      const outputPattern = join(outputDir, `%05d.${format}`);
      command += ` "${outputPattern}" -y`;
      
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Frames extracted from video: ${inputPath} → ${outputDir}/*.${format}\n\n${result}`
        }]
      };
    }

    case "split_video": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const segmentDuration = Number(args?.segmentDuration);
      const outputPattern = validatePath(String(args?.outputPattern));
      
      if (segmentDuration <= 0) {
        throw new Error("segmentDuration must be positive");
      }
      
      await ensureDirectoryExists(outputPattern);
      const command = `-i "${inputPath}" -f segment -segment_time ${segmentDuration} -c copy "${outputPattern}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully split video into segments using pattern ${outputPattern}\n\n${result}`
        }]
      };
    }

    case "fade_video": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const fadeInDuration = Number(args?.fadeInDuration || 0);
      const fadeOutDuration = Number(args?.fadeOutDuration || 0);
      const outputPath = validatePath(String(args?.outputPath));
      
      if (fadeInDuration < 0 || fadeOutDuration < 0) {
        throw new Error("Fade durations must be non-negative");
      }
      
      await ensureDirectoryExists(outputPath);
      
      let videoFilters: string[] = [];
      let audioFilters: string[] = [];
      
      if (fadeInDuration > 0) {
        videoFilters.push(`fade=t=in:st=0:d=${fadeInDuration}`);
        audioFilters.push(`afade=t=in:st=0:d=${fadeInDuration}`);
      }
      
      if (fadeOutDuration > 0) {
        videoFilters.push(`fade=t=out:d=${fadeOutDuration}`);
        audioFilters.push(`afade=t=out:d=${fadeOutDuration}`);
      }
      
      let command = `-i "${inputPath}"`;
      if (videoFilters.length > 0) {
        command += ` -vf "${videoFilters.join(',')}"`;
      }
      if (audioFilters.length > 0) {
        command += ` -af "${audioFilters.join(',')}"`;
      }
      command += ` -c:v libx264 -c:a aac "${outputPath}" -y`;
      
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully applied fade to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "concatenate_videos": {
      const inputPaths = (args?.inputPaths as string[])?.map(path => validatePath(path, true));
      const outputPath = validatePath(String(args?.outputPath));
      
      if (!inputPaths || inputPaths.length === 0) {
        throw new Error("At least one input video is required");
      }
      
      await ensureDirectoryExists(outputPath);
      
      const tempFilePath = join("temp_concat_list.txt");
      const fileList = inputPaths.map(path => `file '${path}'`).join("\n");
      writeFileSync(tempFilePath, fileList);
      
      try {
        const command = `-f concat -safe 0 -i "${tempFilePath}" -c copy "${outputPath}" -y`;
        const result = await runFFmpegCommand(command);
        
        return {
          content: [{
            type: "text",
            text: `Successfully concatenated videos to ${outputPath}\n\n${result}`
          }]
        };
      } finally {
        if (existsSync(tempFilePath)) {
          unlinkSync(tempFilePath);
        }
      }
    }

    case "merge_audio_video": {
      const videoPath = validatePath(String(args?.videoPath), true);
      const audioPath = validatePath(String(args?.audioPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      
      await ensureDirectoryExists(outputPath);
      
      const command = `-i "${videoPath}" -i "${audioPath}" -c copy -map 0:v:0 -map 1:a:0 "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully merged audio and video to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "replace_audio_track": {
      const inputVideoPath = validatePath(String(args?.inputVideoPath), true);
      const inputAudioPath = validatePath(String(args?.inputAudioPath), true);
      const outputPath = validatePath(String(args?.outputPath));
      
      await ensureDirectoryExists(outputPath);
      
      const command = `-i "${inputVideoPath}" -i "${inputAudioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully replaced audio in ${outputPath}\n\n${result}`
        }]
      };
    }

    case "overlay_image": {
      const inputVideoPath = validatePath(String(args?.inputVideoPath), true);
      const inputImagePath = validatePath(String(args?.inputImagePath), true);
      const position = String(args?.position || "bottomright");
      const outputPath = validatePath(String(args?.outputPath));
      
      await ensureDirectoryExists(outputPath);
      
      let overlayPosition = "";
      switch (position.toLowerCase()) {
        case "topleft":
          overlayPosition = "10:10";
          break;
        case "topright":
          overlayPosition = "main_w-overlay_w-10:10";
          break;
        case "bottomleft":
          overlayPosition = "10:main_h-overlay_h-10";
          break;
        case "center":
          overlayPosition = "(main_w-overlay_w)/2:(main_h-overlay_h)/2";
          break;
        case "bottomright":
        default:
          overlayPosition = "main_w-overlay_w-10:main_h-overlay_h-10";
          break;
      }
      
      const command = `-i "${inputVideoPath}" -i "${inputImagePath}" -filter_complex "[0:v][1:v]overlay=${overlayPosition}[v]" -map "[v]" -map "0:a?" -c:v libx264 -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully overlaid image on ${outputPath}\n\n${result}`
        }]
      };
    }

    case "transform_video": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const transformation = String(args?.transformation);
      const params = args?.params || {};
      const outputPath = validatePath(String(args?.outputPath));
      
      const validTransformations = ["crop", "scale", "rotate", "flip", "transpose", "pad"];
      if (!validTransformations.includes(transformation)) {
        throw new Error(`Invalid transformation. Must be one of ${validTransformations.join(", ")}`);
      }
      
      await ensureDirectoryExists(outputPath);
      
      let filterStr = "";
      if (transformation === "crop") {
        filterStr = `crop=${params.width}:${params.height}:${params.x}:${params.y}`;
      } else if (transformation === "scale") {
        filterStr = `scale=${params.width}:${params.height}`;
      } else if (transformation === "rotate") {
        filterStr = `rotate=${params.angle}*PI/180`;
      } else if (transformation === "flip") {
        if (!["horizontal", "vertical"].includes(params.direction)) {
          throw new Error("direction must be 'horizontal' or 'vertical'");
        }
        filterStr = params.direction === "horizontal" ? "hflip" : "vflip";
      } else if (transformation === "transpose") {
        if (!(0 <= Number(params.dir) && Number(params.dir) <= 3)) {
          throw new Error("dir must be between 0 and 3");
        }
        filterStr = `transpose=${params.dir}`;
      } else if (transformation === "pad") {
        const color = params.color || "black";
        filterStr = `pad=${params.width}:${params.height}:${params.x}:${params.y}:${color}`;
      }
      
      const command = `-i "${inputPath}" -vf "${filterStr}" -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully transformed video to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "apply_color_curves": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const redCurve = String(args?.redCurve);
      const greenCurve = String(args?.greenCurve);
      const blueCurve = String(args?.blueCurve);
      const outputPath = validatePath(String(args?.outputPath));
      
      await ensureDirectoryExists(outputPath);
      
      const curvesFilter = `curves=red='${redCurve}':green='${greenCurve}':blue='${blueCurve}'`;
      const eqFilter = "eq=contrast=1.2:saturation=0.8";
      const vignetteAngle = Math.PI / 4;
      const vignetteFilter = `vignette=angle=${vignetteAngle}`;
      const filterStr = [curvesFilter, eqFilter, vignetteFilter].join(",");
      
      const command = `-i "${inputPath}" -vf "${filterStr}" -c:v libx264 -preset ultrafast -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully applied color curves to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "set_video_fps": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const fps = Number(args?.fps);
      const outputPath = validatePath(String(args?.outputPath));
      
      if (fps <= 0) {
        throw new Error("fps must be positive");
      }
      
      await ensureDirectoryExists(outputPath);
      
      const filterStr = `fps=fps=${fps}`;
      const command = `-i "${inputPath}" -vf "${filterStr}" -c:v libx264 -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully set fps to ${fps} in ${outputPath}\n\n${result}`
        }]
      };
    }

    case "add_video_noise": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const noiseStrength = Number(args?.noiseStrength);
      const noiseFlags = String(args?.noiseFlags);
      const outputPath = validatePath(String(args?.outputPath));
      
      if (noiseStrength < 0) {
        throw new Error("noiseStrength must be non-negative");
      }
      
      await ensureDirectoryExists(outputPath);
      
      const filterStr = `noise=c0s=${noiseStrength}:c0f=${noiseFlags}`;
      const command = `-i "${inputPath}" -vf "${filterStr}" -c:v libx264 -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully added noise to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "apply_overlay": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const overlayPath = validatePath(String(args?.overlayPath), true);
      const position = String(args?.position || "bottomright");
      const opacity = Number(args?.opacity);
      const outputPath = validatePath(String(args?.outputPath));
      
      if (!(0 <= opacity && opacity <= 1)) {
        throw new Error("opacity must be between 0 and 1");
      }
      
      await ensureDirectoryExists(outputPath);
      
      let overlayPosition = "";
      switch (position.toLowerCase()) {
        case "topleft":
          overlayPosition = "10:10";
          break;
        case "topright":
          overlayPosition = "main_w-overlay_w-10:10";
          break;
        case "bottomleft":
          overlayPosition = "10:main_h-overlay_h-10";
          break;
        case "center":
          overlayPosition = "(main_w-overlay_w)/2:(main_h-overlay_h)/2";
          break;
        case "bottomright":
        default:
          overlayPosition = "main_w-overlay_w-10:main_h-overlay_h-10";
          break;
      }
      
      const filterComplex = `[1:v]format=yuva444p,colorchannelmixer=aa=${opacity}[overlay];[0:v][overlay]overlay=${overlayPosition}[v]`;
      const command = `-i "${inputPath}" -i "${overlayPath}" -filter_complex "${filterComplex}" -map "[v]" -map "0:a?" -c:v libx264 -c:a copy "${outputPath}" -y`;
      const result = await runFFmpegCommand(command);
      
      return {
        content: [{
          type: "text",
          text: `Successfully applied overlay to ${outputPath}\n\n${result}`
        }]
      };
    }

    case "apply_filter_template": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const templateName = String(args?.templateName);
      const outputPath = validatePath(String(args?.outputPath));
      const filtersDir = join("E:", "mcpffmpeg", "src", "filters");
      const templatePath = join(filtersDir, `${templateName}.json`);
      if (!existsSync(templatePath)) {
        throw new Error(`Filter template ${templateName} not found at ${templatePath}`);
      }
      
      await ensureDirectoryExists(outputPath);
      
      const template = JSON.parse(readFileSync(templatePath, "utf-8"));
      
      let currentFile = inputPath;
      const tempFiles: string[] = [];
      
      if (template.curves && template.eq && template.vignette) {
        const curves = template.curves;
        const eq = template.eq;
        const vignette = template.vignette;
        
        const curvesFilter = `curves=red='${curves.red}':green='${curves.green}':blue='${curves.blue}'`;
        const eqFilter = `eq=contrast=${eq.contrast}:saturation=${eq.saturation}`;
        const vignetteFilter = `vignette=angle=${vignette.angle}`;
        const filterStr = [curvesFilter, eqFilter, vignetteFilter].join(",");
        
        const tempOutput = `temp_${tempFiles.length}.mp4`;
        tempFiles.push(tempOutput);
        
        const command = `-i "${currentFile}" -vf "${filterStr}" -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${tempOutput}" -y`;
        await runFFmpegCommand(command);
        currentFile = tempOutput;
      }
      
      if (template.fps) {
        const fps = template.fps;
        const tempOutput = `temp_${tempFiles.length}.mp4`;
        tempFiles.push(tempOutput);
        
        const command = `-i "${currentFile}" -vf "fps=fps=${fps}" -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${tempOutput}" -y`;
        await runFFmpegCommand(command);
        currentFile = tempOutput;
      }
      
      if (template.noise) {
        const noise = template.noise;
        const filterStr = `noise=c0s=${noise.strength}:c0f=${noise.flags}`;
        const tempOutput = `temp_${tempFiles.length}.mp4`;
        tempFiles.push(tempOutput);
        
        const command = `-i "${currentFile}" -vf "${filterStr}" -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${tempOutput}" -y`;
        await runFFmpegCommand(command);
        currentFile = tempOutput;
      }
      
      const finalCommand = `-i "${currentFile}" -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${outputPath}" -y`;
      await runFFmpegCommand(finalCommand);
      
      for (const tempFile of tempFiles) {
        if (existsSync(tempFile)) {
          unlinkSync(tempFile);
        }
      }
      
      return {
        content: [{
          type: "text",
          text: `Successfully applied ${templateName} filter to ${outputPath}`
        }]
      };
    }

    case "list_filter_templates": {
      const filtersDir = join("E:", "mcpffmpeg", "src", "filters");
      if (!existsSync(filtersDir)) {
        return {
          content: [{
            type: "text",
            text: `No filter templates found at ${filtersDir}.`
          }]
        };
      }
      
      const templates = readdirSync(filtersDir)
        .filter(f => f.endsWith(".json"))
        .map(f => f.split(".")[0]);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(templates)
        }]
      };
    }

    case "remove_segment": {
      const inputPath = validatePath(String(args?.inputPath), true);
      const startTime = String(args?.startTime);
      const endTime = String(args?.endTime);
      const outputPath = validatePath(String(args?.outputPath));
      
      const startSec = parseTimeToSeconds(startTime);
      const endSec = parseTimeToSeconds(endTime);
      
      if (startSec < 0 || endSec <= startSec) {
        throw new Error("startTime must be non-negative, and endTime must be greater than startTime");
      }
      
      await ensureDirectoryExists(outputPath);
      
      const tempFiles: string[] = [];
      try {
        const part1Path = "temp_part1.mp4";
        tempFiles.push(part1Path);
        const part1Command = `-i "${inputPath}" -ss 0 -t ${startTime} -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${part1Path}" -y`;
        await runFFmpegCommand(part1Command);
        
        const part2Path = "temp_part2.mp4";
        tempFiles.push(part2Path);
        const part2Command = `-i "${inputPath}" -ss ${endTime} -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${part2Path}" -y`;
        await runFFmpegCommand(part2Command);
        
        if (!existsSync(part1Path) || !existsSync(part2Path)) {
          throw new Error("Failed to create one or both video segments");
        }
        
        const concatListPath = "temp_concat_list.txt";
        tempFiles.push(concatListPath);
        const concatList = `file '${part1Path}'\nfile '${part2Path}'`;
        writeFileSync(concatListPath, concatList);
        
        const concatCommand = `-f concat -safe 0 -i "${concatListPath}" -c:v libx264 -preset medium -profile:v baseline -pix_fmt yuv420p -c:a aac "${outputPath}" -y`;
        const result = await runFFmpegCommand(concatCommand);
        
        return {
          content: [{
            type: "text",
            text: `Successfully removed segment (${startTime} to ${endTime}) from ${inputPath}. Output saved to ${outputPath}\n\n${result}`
          }]
        };
      } finally {
        for (const tempFile of tempFiles) {
          if (existsSync(tempFile)) {
            unlinkSync(tempFile);
          }
        }
      }
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}