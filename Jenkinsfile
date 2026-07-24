pipeline {
    agent any

    environment {
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-credentials')
        DOCKERHUB_USER = "${DOCKERHUB_CREDENTIALS_USR}"
        GITHUB_CREDENTIALS = credentials('github-credentials')
        GIT_USER = "${GITHUB_CREDENTIALS_USR}"
        GIT_TOKEN = "${GITHUB_CREDENTIALS_PSW}"
        IMAGE_TAG = "${env.BUILD_NUMBER}"
        HOST_WORKSPACE = "/home/anu/jenkins-home/workspace/microservice-app-ci"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Run Tests') {
            parallel {
                stage('Test user-service') {
                    steps {
                        sh '''
                            docker run --rm -v "$HOST_WORKSPACE/src/user-service":/app -w /app node:20-alpine sh -c "npm install && npm test"
                        '''
                    }
                }
                stage('Test order-service') {
                    steps {
                        sh '''
                            docker run --rm -v "$HOST_WORKSPACE/src/order-service":/app -w /app node:20-alpine sh -c "npm install && npm test"
                        '''
                    }
                }
            }
        }

        stage('Build Images') {
            parallel {
                stage('Build user-service') {
                    steps {
                        sh 'docker build -t $DOCKERHUB_USER/user-service:$IMAGE_TAG -t $DOCKERHUB_USER/user-service:latest $WORKSPACE/src/user-service'
                    }
                }
                stage('Build order-service') {
                    steps {
                        sh 'docker build -t $DOCKERHUB_USER/order-service:$IMAGE_TAG -t $DOCKERHUB_USER/order-service:latest $WORKSPACE/src/order-service'
                    }
                }
                stage('Build frontend') {
                    steps {
                        sh 'docker build -t $DOCKERHUB_USER/frontend:$IMAGE_TAG -t $DOCKERHUB_USER/frontend:latest $WORKSPACE/src/frontend'
                    }
                }
            }
        }

        stage('Scan Images (Trivy)') {
            steps {
                sh 'docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --severity HIGH,CRITICAL --exit-code 0 $DOCKERHUB_USER/user-service:$IMAGE_TAG'
                sh 'docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --severity HIGH,CRITICAL --exit-code 0 $DOCKERHUB_USER/order-service:$IMAGE_TAG'
                sh 'docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image --severity HIGH,CRITICAL --exit-code 0 $DOCKERHUB_USER/frontend:$IMAGE_TAG'
            }
        }

        stage('Push to Docker Hub') {
            steps {
                sh 'echo $DOCKERHUB_CREDENTIALS_PSW | docker login -u $DOCKERHUB_CREDENTIALS_USR --password-stdin'
                sh 'docker push $DOCKERHUB_USER/user-service:$IMAGE_TAG'
                sh 'docker push $DOCKERHUB_USER/user-service:latest'
                sh 'docker push $DOCKERHUB_USER/order-service:$IMAGE_TAG'
                sh 'docker push $DOCKERHUB_USER/order-service:latest'
                sh 'docker push $DOCKERHUB_USER/frontend:$IMAGE_TAG'
                sh 'docker push $DOCKERHUB_USER/frontend:latest'
            }
        }

        stage('Update Manifests') {
            steps {
                sh '''
                    sed -i "s|image: .*/user-service:.*|image: ${DOCKERHUB_USER}/user-service:${IMAGE_TAG}|" k8s/base/user-service.yaml
                    sed -i "s|image: .*/order-service:.*|image: ${DOCKERHUB_USER}/order-service:${IMAGE_TAG}|" k8s/base/order-service.yaml
                    sed -i "s|image: .*/frontend:.*|image: ${DOCKERHUB_USER}/frontend:${IMAGE_TAG}|" k8s/base/frontend.yaml

                    git config user.email "jenkins@ci.local"
                    git config user.name "Jenkins CI"
                    git add k8s/base/user-service.yaml k8s/base/order-service.yaml k8s/base/frontend.yaml
                    git commit -m "ci: update image tags to build ${IMAGE_TAG}" || echo "No changes to commit"
                    git push https://${GIT_USER}:${GIT_TOKEN}@github.com/anusree-ux/microservice-kubernetes.git HEAD:main
                '''
            }
        }
    }

    post {
        always {
            sh 'docker logout || true'
        }
        success {
            echo "Pipeline succeeded — images pushed and manifests updated for build ${IMAGE_TAG}"
        }
        failure {
            echo "Pipeline failed — check stage logs above"
        }
    }
}
