pipeline {
    agent any

    environment {
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-credentials')
        DOCKERHUB_USER = "${DOCKERHUB_CREDENTIALS_USR}"
        IMAGE_TAG = "${env.BUILD_NUMBER}"
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
                        dir('src/user-service') {
                            sh 'npm install'
                            sh 'npm test'
                        }
                    }
                }
                stage('Test order-service') {
                    steps {
                        dir('src/order-service') {
                            sh 'npm install'
                            sh 'npm test'
                        }
                    }
                }
            }
        }

        stage('Build Images') {
            parallel {
                stage('Build user-service') {
                    steps {
                        sh "docker build -t ${DOCKERHUB_USER}/user-service:${IMAGE_TAG} -t ${DOCKERHUB_USER}/user-service:latest ./src/user-service"
                    }
                }
                stage('Build order-service') {
                    steps {
                        sh "docker build -t ${DOCKERHUB_USER}/order-service:${IMAGE_TAG} -t ${DOCKERHUB_USER}/order-service:latest ./src/order-service"
                    }
                }
                stage('Build frontend') {
                    steps {
                        sh "docker build -t ${DOCKERHUB_USER}/frontend:${IMAGE_TAG} -t ${DOCKERHUB_USER}/frontend:latest ./src/frontend"
                    }
                }
            }
        }

        stage('Scan Images (Trivy)') {
            steps {
                sh '''
                    if ! command -v trivy &> /dev/null; then
                        wget -qO- https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
                    fi
                '''
                sh "trivy image --severity HIGH,CRITICAL --exit-code 0 ${DOCKERHUB_USER}/user-service:${IMAGE_TAG}"
                sh "trivy image --severity HIGH,CRITICAL --exit-code 0 ${DOCKERHUB_USER}/order-service:${IMAGE_TAG}"
                sh "trivy image --severity HIGH,CRITICAL --exit-code 0 ${DOCKERHUB_USER}/frontend:${IMAGE_TAG}"
            }
        }

        stage('Push to Docker Hub') {
            steps {
                sh 'echo $DOCKERHUB_CREDENTIALS_PSW | docker login -u $DOCKERHUB_CREDENTIALS_USR --password-stdin'
                sh "docker push ${DOCKERHUB_USER}/user-service:${IMAGE_TAG}"
                sh "docker push ${DOCKERHUB_USER}/user-service:latest"
                sh "docker push ${DOCKERHUB_USER}/order-service:${IMAGE_TAG}"
                sh "docker push ${DOCKERHUB_USER}/order-service:latest"
                sh "docker push ${DOCKERHUB_USER}/frontend:${IMAGE_TAG}"
                sh "docker push ${DOCKERHUB_USER}/frontend:latest"
            }
        }
    }

    post {
        always {
            sh 'docker logout || true'
        }
        success {
            echo "Pipeline succeeded — images pushed as build ${IMAGE_TAG}"
        }
        failure {
            echo "Pipeline failed — check stage logs above"
        }
    }
}
