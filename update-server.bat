@echo off
echo ========================================================
echo Telling Oracle Cloud to pull latest GitHub code...
echo ========================================================
ssh ph "cd ~/pilehead-scraper-cloud && git pull && sudo docker rm -f pilehead-backend && sudo docker build -t scrape-app . && sudo docker run -d -p 3001:3001 --name pilehead-backend -v /home/ubuntu/pilehead-scraper-cloud/config:/app/config scrape-app"
echo.
echo ========================================================
echo Server Update Complete! You can refresh your website now.
echo ========================================================
pause
