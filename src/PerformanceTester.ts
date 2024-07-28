import axios from 'axios';
import { promisify } from 'util';
import * as fs from 'fs';
import * as readline from 'readline';
import { PerformanceTesterConfig } from './types';
export type { PerformanceTesterConfig } from './types';

const writeFile = promisify(fs.writeFile);
const appendFile = promisify(fs.appendFile);

class PerformanceTester {
  private config: PerformanceTesterConfig;
  private logFilePath: string;
  private summaryFilePath: string;
  private completedRequests: number;
  private totalRequests: number;


  constructor(logFilePath: string, summaryFilePath: string, config: PerformanceTesterConfig) {
    this.logFilePath = logFilePath;
    this.summaryFilePath = summaryFilePath;
    this.config = config;
    this.completedRequests = 0;
    this.totalRequests = 0;
  }

  private async initCsvFile() {
    const headers = 'Request ID,Time Sent,Time to First Chunk (seconds),Total Time (seconds),Status,Response\n';
    await writeFile(this.logFilePath, headers);
  }

  private async logToCsv(logData: any) {
    const csvRow = `${logData.requestId},${logData.timeSent},${logData.timeToFirstChunk},${logData.totalTime},${logData.status},${logData.response}\n`;
    await appendFile(this.logFilePath, csvRow);
  }

  private async logSummary() {
    const fileStream = fs.createReadStream(this.logFilePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let totalRequests = 0;
    let totalFirstChunkTime = 0;
    let totalCompletionTime = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    for await (const line of rl) {
      if (line.startsWith('Request ID')) continue; // Skip header

      const [requestId, timeSent, timeToFirstChunk, totalTime, status, response] = line.split(',');
      totalRequests += 1;
      totalFirstChunkTime += timeToFirstChunk !== 'N/A' ? parseFloat(timeToFirstChunk) : 0;
      totalCompletionTime += parseFloat(totalTime);
      if (status.trim() === '200' || status.trim() === '201') {
        totalPassed += 1;
      } else {
        totalFailed += 1;
      }
    }

    const avgFirstChunkTime = totalRequests ? totalFirstChunkTime / totalRequests : 0;
    const avgCompletionTime = totalRequests ? totalCompletionTime / totalRequests : 0;

    const summary = `Total Requests, Avg First Chunk Time (s), Avg Completion Time (s), Passed, Failed\n${totalRequests}, ${avgFirstChunkTime.toFixed(2)}, ${avgCompletionTime.toFixed(2)}, ${totalPassed}, ${totalFailed}\n`;
    await writeFile(this.summaryFilePath, summary);
  }

  private async fetchData(requestId: number) {
    const startTime = new Date().getTime();
    const timeSent = new Date(startTime).toString();

    try {
      const response = await axios.request({
        ...this.config,
        data: JSON.stringify(this.config.payload),
        responseType: 'stream'
      });

      let data = '';
      let firstChunkTime: any = null;
      response.data.on('data', (chunk: any) => {
        if (firstChunkTime === null) {
          firstChunkTime = new Date().getTime();
          const timeToFirstChunk = (firstChunkTime - startTime) / 1000;
          console.log(`Request ${requestId} - First chunk received at: ${firstChunkTime}`);
          console.log(`Request ${requestId} - Time to first chunk (seconds): ${timeToFirstChunk}`);
        }
        data += chunk.toString('utf-8');
      });

      response.data.on('end', async () => {
        const endTime = new Date().getTime();
        const totalTime = (endTime - startTime) / 1000;
        const logData = {
          requestId,
          timeSent,
          timeToFirstChunk: firstChunkTime ? (firstChunkTime - startTime) / 1000 : 'N/A',
          totalTime,
          status: response.status,
          response: data.replace(/\n/g, ' ')
        };

        console.log(`Request ${requestId} - Response completed at: ${endTime}`);
        console.log(`Request ${requestId} - Total time to complete response (seconds): ${totalTime}`);
        await this.logToCsv(logData);
        this.completedRequests++;

        if (this.completedRequests === this.totalRequests) {
          await this.logSummary();
        }
      });
      response.data.on('error', async () => {
        const endTime = new Date().getTime();
        const totalTime = (endTime - startTime) / 1000;
        const logData = {
          requestId,
          timeSent,
          timeToFirstChunk: firstChunkTime ? (firstChunkTime - startTime) / 1000 : 'N/A',
          totalTime,
          status: data,
          response: data.replace(/\n/g, ' ')
        };

        console.log(`Request ${requestId} - Response Failed at: ${endTime}`);
        console.log(`Request ${requestId} - Response Failed after: (seconds): ${totalTime}`);
        await this.logToCsv(logData);
        this.completedRequests++;

        if (this.completedRequests === this.totalRequests) {
          await this.logSummary();
        }
      });

    } catch (error: any) {
      const endTime = new Date().getTime();
      const logData = {
        requestId,
        timeSent,
        timeToFirstChunk: 'N/A',
        totalTime: (endTime - startTime) / 1000,
        status: `Failed - ${error.message}`,
        response: 'N/A'
      };
      console.log(`Request ${requestId} - Response Failed at: ${error.message}`);
      await this.logToCsv(logData);
      this.completedRequests++;

      if (this.completedRequests === this.totalRequests) {
        await this.logSummary();
      }
    }
  }

  public async executeConcurrentRequests(numRequests: number, durationMinutes: number) {
    await this.initCsvFile();
    this.totalRequests = numRequests;
    const intervalMilliseconds = (durationMinutes * 60 * 1000) / numRequests;

    let requestCounter = 0;
    const intervalId = setInterval(() => {
      if (requestCounter >= numRequests) {
        clearInterval(intervalId);
        return;
      }

      requestCounter++;
      const delay = intervalMilliseconds;
      setTimeout(() => {
        console.log(`Request ${requestCounter} - Sending request at: ${new Date().toString()}`);
        this.fetchData(requestCounter);
      }, delay);

    }, intervalMilliseconds);
  }
}

export default PerformanceTester;
