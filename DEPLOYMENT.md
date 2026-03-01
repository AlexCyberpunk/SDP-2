# Online Deployment Guide (GitLab + Render)

To deploy Sea Distances to a live online environment for free without facing file size limits, we will use **GitLab** for our code repository and **Render** for our web hosting.

This project is fully containerized using a `Dockerfile`, meaning Render will automatically build the environment exactly as it runs on your machine.

## Step 1: Upload to GitLab via Terminal (Bulletproof Method)
Dragging folders into a web browser is notoriously buggy. Since you're on a Mac (which has Git pre-installed), the absolute most reliable way to get this perfect structure into GitLab is using your Terminal!

I have already done the hard work of initializing the invisible tracking files (`git init`) and bundling all 79 files perfectly for you (`git commit`). 

All you have to do when you return is open your Mac Terminal and run these **3 lines exactly as shown**:

1. Move into the optimized folder:
   ```bash
   cd "/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/Sea Distances pro 2 web"
   ```
2. Connect it to your empty GitLab repository (using your actual URL):
   ```bash
   git remote add origin https://gitlab.com/greenaldo/MaritimeDistances2.git
   ```
3. Push the files up to the internet:
   ```bash
   git push -u origin main
   ```
   *(Note: It will prompt you for your GitLab username and password. If you have Two-Factor Authentication enabled on GitLab, use a "Personal Access Token" instead of your password!)*

Once that command finishes, refresh your GitLab page. You will see the `Dockerfile` absolutely correctly sitting right on the front page. Rendering will happen flawlessly!

## Step 2: Deploy to Render.com
Render is a popular cloud hosting platform that can read your GitLab repository and spin up your container for free.

1. Go to [Render.com](https://render.com) and sign up/log in using your GitLab account (this makes linking repositories seamless).
2. Click the **New +** button in the dashboard and select **Web Service**.
3. Look for the "Connect a repository" section on the right side. You should see your GitLab repositories listed there. Click **Connect** next to your `sea-distances-web` repository.
4. Render will ask you to configure the Web Service. Fill it out as follows:
   * **Name**: `sea-distances` (or whatever you prefer)
   * **Region**: Choose whatever is closest to you.
   * **Branch**: `main`
   * **Environment**: `Docker`
5. Select the **Free** instance type at the bottom.
6. Click **Create Web Service**.

## Step 3: Wait and Launch!
Render will now read your code, download the Linux Ubuntu environment from the `Dockerfile`, install the Python `searoute` dependencies, and start the Fast API server on Port `8000`. 
This usually takes **3 to 5 minutes** the very first time.

Watch the log console on Render. Once you see `Application startup complete.` and "Your Web Service is live", you can click the `https://...onrender.com` link at the top left to use your Sea Distances app from anywhere in the world!
