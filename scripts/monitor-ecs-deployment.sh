#!/bin/bash
# Monitor ECS deployment until services are running
# Usage: ./scripts/monitor-ecs-deployment.sh

set -e

CLUSTER="press-rele-prod-cluster"
MAX_CHECKS=40  # 20 minutes (30 seconds * 40)
CHECK_INTERVAL=30

echo "=== ECS Deployment Monitor ==="
echo "Cluster: $CLUSTER"
echo "Max wait time: $((MAX_CHECKS * CHECK_INTERVAL / 60)) minutes"
echo ""

for i in $(seq 1 $MAX_CHECKS); do
  echo "=== Check $i/$MAX_CHECKS at $(date) ==="
  
  # Get service status
  AWS_PROFILE=your-aws-profile aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services press-rele-prod-backend press-rele-prod-frontend \
    --query 'services[*].[serviceName,runningCount,desiredCount,deployments[0].status]' \
    --output table
  
  # Check running counts
  BACKEND_RUNNING=$(AWS_PROFILE=your-aws-profile aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services press-rele-prod-backend \
    --query 'services[0].runningCount' --output text)
  
  FRONTEND_RUNNING=$(AWS_PROFILE=your-aws-profile aws ecs describe-services \
    --cluster "$CLUSTER" \
    --services press-rele-prod-frontend \
    --query 'services[0].runningCount' --output text)
  
  echo "Backend running: $BACKEND_RUNNING, Frontend running: $FRONTEND_RUNNING"
  
  # Check if both services are running
  if [ "$BACKEND_RUNNING" = "1" ] && [ "$FRONTEND_RUNNING" = "1" ]; then
    echo ""
    echo "✅ SUCCESS: Both services are running!"
    echo ""
    
    # Get ALB DNS
    ALB_DNS=$(AWS_PROFILE=your-aws-profile aws elbv2 describe-load-balancers \
      --query 'LoadBalancers[0].DNSName' --output text)
    
    echo "=== Testing Endpoints ==="
    echo "ALB DNS: $ALB_DNS"
    echo ""
    
    # Test health endpoint
    echo "Testing /health endpoint..."
    curl -s -o /dev/null -w "Status: %{http_code}\n" "http://${ALB_DNS}/health" || echo "Health check failed"
    echo ""
    
    # Test API status
    echo "Testing /api/v1/status endpoint..."
    curl -s "http://${ALB_DNS}/api/v1/status" | jq '.' || echo "API status check failed"
    echo ""
    
    # Test frontend
    echo "Testing frontend..."
    curl -s -o /dev/null -w "Status: %{http_code}\n" "http://${ALB_DNS}/" || echo "Frontend check failed"
    echo ""
    
    echo "Deployment complete! Access your application at: http://${ALB_DNS}"
    exit 0
  fi
  
  # Show recent events if not running yet
  if [ "$i" -eq 1 ] || [ $((i % 5)) -eq 0 ]; then
    echo ""
    echo "Recent backend events:"
    AWS_PROFILE=your-aws-profile aws ecs describe-services \
      --cluster "$CLUSTER" \
      --services press-rele-prod-backend \
      --query 'services[0].events[0:2].[createdAt,message]' \
      --output text | head -4
  fi
  
  echo ""
  sleep $CHECK_INTERVAL
done

echo "❌ TIMEOUT: Services did not start within $((MAX_CHECKS * CHECK_INTERVAL / 60)) minutes"
echo "Check CloudWatch logs for details"
exit 1